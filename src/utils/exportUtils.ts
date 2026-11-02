import type { Batch, Allocation, Faculty, DayOfWeek } from '../types';
import ExcelJS from 'exceljs';

export const sanitizeClonedDocColors = (clonedDoc: Document) => {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const normalize = (color: string): string => {
      if (!color || !color.includes('oklch')) return color;
      ctx.fillStyle = '#000000';
      ctx.fillStyle = color;
      return ctx.fillStyle;
    };

    const elements = clonedDoc.querySelectorAll('*');
    elements.forEach(node => {
      const el = node as HTMLElement;
      if (!el.style) return;
      const comp = window.getComputedStyle(el);

      if (comp.backgroundColor && comp.backgroundColor.includes('oklch')) {
        el.style.backgroundColor = normalize(comp.backgroundColor);
      }
      if (comp.color && comp.color.includes('oklch')) {
        el.style.color = normalize(comp.color);
      }
      if (comp.borderColor && comp.borderColor.includes('oklch')) {
        el.style.borderColor = normalize(comp.borderColor);
      }
    });
  } catch (e) {
    console.warn('Color sanitization notice:', e);
  }
};

/**
 * Modern Excel Export using ExcelJS (replaces vulnerable SheetJS xlsx)
 * Dynamically handles varying batch periods instead of hardcoding 6 periods.
 */
export const exportTimetableToExcel = async (
  day: DayOfWeek,
  batches: Batch[],
  allocations: Allocation[],
  faculties: Faculty[]
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Timetable Pro';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(`Timetable ${day}`, {
    pageSetup: { orientation: 'landscape', paperSize: 9 }, // A4 landscape
  });

  // Calculate dynamic maximum periods across all batches
  const maxPeriods = Math.max(...batches.map(b => b.periods.length), 6);

  // Define headers
  const columns: { header: string; key: string; width: number }[] = [
    { header: 'Building', key: 'building', width: 14 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Batch Name', key: 'batchName', width: 20 },
    { header: 'Room No.', key: 'room', width: 12 },
  ];

  for (let p = 0; p < maxPeriods; p++) {
    columns.push({
      header: `Period ${p + 1}`,
      key: `p_${p}`,
      width: 24,
    });
  }

  worksheet.columns = columns;

  // Style Header Row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF6B2638' }, // Burgundy brand color
  };

  // Populate data
  batches.forEach((batch, bIdx) => {
    const rowData: Record<string, string> = {
      building: batch.building,
      category: batch.yearCategory,
      batchName: batch.name,
      room: batch.roomNumber || '-',
    };

    for (let p = 0; p < maxPeriods; p++) {
      const timing = batch.periods[p];
      const alloc = allocations.find(a => a.batchId === batch.id && a.periodIndex === p);
      if (!timing || !timing.startTime) {
        rowData[`p_${p}`] = 'Not in session';
      } else if (!alloc || !alloc.facultyId) {
        if (alloc && alloc.vacatedFacultyId) {
          rowData[`p_${p}`] = `[GAP] ${alloc.subject} (${alloc.vacatedFacultyName || 'Absent'})`;
        } else {
          rowData[`p_${p}`] = 'Free Period';
        }
      } else {
        const fac = faculties.find(f => f.id === alloc.facultyId);
        const facName = fac?.name || alloc.facultyId;
        const lockMark = alloc.frozen ? ' [LOCK]' : '';
        rowData[`p_${p}`] = `${alloc.subject} - ${facName}${lockMark}`;
      }
    }

    const row = worksheet.addRow(rowData);
    row.height = 22;
    row.alignment = { vertical: 'middle' };

    // Alternate row zebra striping
    if (bIdx % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF9F6F0' }, // Warm beige
      };
    }

    // Add thin border to cells
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E0D8' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E0D8' } },
        left: { style: 'thin', color: { argb: 'FFE5E0D8' } },
        right: { style: 'thin', color: { argb: 'FFE5E0D8' } },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Timetable_${day}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * High-resolution PNG export excluding floating UI controls
 */
export const exportTimetableToPng = async (
  containerElement: HTMLElement,
  day: DayOfWeek
): Promise<void> => {
  const html2canvas = (await import('html2canvas')).default;

  const canvas = await html2canvas(containerElement, {
    scale: 2,
    backgroundColor: '#F3EEE6',
    useCORS: true,
    logging: false,
    ignoreElements: element => element.classList.contains('no-export'),
    onclone: clonedDoc => sanitizeClonedDocColors(clonedDoc),
  });

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `Timetable_${day}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/**
 * PDF Export with A4 landscape scaling
 */
export const exportTimetableToPdf = async (
  containerElement: HTMLElement,
  day: DayOfWeek
): Promise<void> => {
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const canvas = await html2canvas(containerElement, {
    scale: 1.5,
    backgroundColor: '#F3EEE6',
    useCORS: true,
    logging: false,
    ignoreElements: element => element.classList.contains('no-export'),
    onclone: clonedDoc => sanitizeClonedDocColors(clonedDoc),
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [canvas.width, canvas.height],
  });

  pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save(`Timetable_${day}.pdf`);
};

