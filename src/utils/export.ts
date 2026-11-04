import type { Batch, Allocation, Faculty, DayOfWeek, TimetableStatus } from '../types';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SECTIONS, groupBatchesBySection } from './sections';

/**
 * Builds an ExcelJS Workbook for the timetable.
 * - Sheet 1: Summary Sheet with metrics, section breakdown, and batch overview.
 * - Sheets 2+: Dedicated sheet per section (dynamically sized based on each section's real period count).
 */
export const buildTimetableWorkbook = (
  day: DayOfWeek,
  batches: Batch[],
  allocations: Allocation[],
  faculties: Faculty[],
  status: TimetableStatus = 'Draft'
): ExcelJS.Workbook => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Timetable Pro';
  workbook.created = new Date();

  const sectionedBatches = groupBatchesBySection(batches);
  const totalSlots = batches.reduce(
    (sum, b) => sum + b.periods.filter(p => p && p.startTime).length,
    0
  );
  const filledSlots = allocations.filter(a => a.facultyId).length;
  const gapSlots = allocations.filter(a => a.vacatedFacultyId && !a.facultyId).length;
  const activeFacultyCount = new Set(allocations.filter(a => a.facultyId).map(a => a.facultyId)).size;
  const overallFillRate = totalSlots === 0 ? 0 : Math.round((filledSlots / totalSlots) * 100);

  // --------------------------------------------------------------------------
  // SHEET 1: Summary Sheet
  // --------------------------------------------------------------------------
  const summarySheet = workbook.addWorksheet('Summary', {
    pageSetup: { orientation: 'landscape', paperSize: 9 },
  });

  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 22;
  summarySheet.getColumn(3).width = 18;
  summarySheet.getColumn(4).width = 18;
  summarySheet.getColumn(5).width = 18;
  summarySheet.getColumn(6).width = 18;

  // Header Banner
  const titleRow = summarySheet.addRow(['TIMETABLE PRO — ACADEMIC SCHEDULE SUMMARY']);
  titleRow.height = 32;
  titleRow.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleRow.alignment = { vertical: 'middle', horizontal: 'left' };
  titleRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF6B2638' }, // Brand Burgundy
  };

  const metaRow = summarySheet.addRow([
    `Academic Day: ${day}  |  Status: ${status}  |  Exported: ${new Date().toLocaleDateString()}`,
  ]);
  metaRow.height = 20;
  metaRow.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF5E5B61' } };

  summarySheet.addRow([]); // Blank line

  // Key Statistics Table Header
  const statHeader = summarySheet.addRow(['KEY METRIC', 'VALUE', '', '', '', '']);
  statHeader.height = 24;
  statHeader.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  statHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF252326' }, // Charcoal
  };

  const statsData: [string, string | number][] = [
    ['Academic Schedule Day', day],
    ['Timetable Status', status],
    ['Total Classroom Batches', batches.length],
    ['Total Scheduled Periods', totalSlots],
    ['Assigned Teaching Slots', filledSlots],
    ['Unassigned / Absent Gaps', gapSlots],
    ['Active Instructors', activeFacultyCount],
    ['Overall Schedule Fill Rate', `${overallFillRate}%`],
  ];

  statsData.forEach(([metric, val], idx) => {
    const row = summarySheet.addRow([metric, val]);
    row.height = 20;
    row.alignment = { vertical: 'middle' };
    if (idx % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFDFBF7' },
      };
    }
    row.getCell(1).border = {
      left: { style: 'thin', color: { argb: 'FFE5E0D8' } },
      right: { style: 'thin', color: { argb: 'FFE5E0D8' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E0D8' } },
    };
    row.getCell(2).border = {
      left: { style: 'thin', color: { argb: 'FFE5E0D8' } },
      right: { style: 'thin', color: { argb: 'FFE5E0D8' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E0D8' } },
    };
  });

  summarySheet.addRow([]); // Blank line

  // Section Breakdown Table Header
  const sectionHeader = summarySheet.addRow([
    'Section Name',
    'Campus Building',
    'Total Batches',
    'Total Periods',
    'Filled Periods',
    'Fill Rate',
  ]);
  sectionHeader.height = 24;
  sectionHeader.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  sectionHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF6B2638' },
  };

  SECTIONS.forEach((sec, idx) => {
    const secBatches = sectionedBatches[sec.id] || [];
    const secBatchIds = new Set(secBatches.map(b => b.id));
    const secTotal = secBatches.reduce(
      (sum, b) => sum + b.periods.filter(p => p && p.startTime).length,
      0
    );
    const secFilled = allocations.filter(a => secBatchIds.has(a.batchId) && a.facultyId).length;
    const secPct = secTotal === 0 ? 0 : Math.round((secFilled / secTotal) * 100);

    const row = summarySheet.addRow([
      sec.label,
      sec.id.includes('b1') ? 'Building 1' : 'Building 2',
      secBatches.length,
      secTotal,
      secFilled,
      `${secPct}%`,
    ]);
    row.height = 20;
    row.alignment = { vertical: 'middle' };
    if (idx % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFDFBF7' },
      };
    }
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E0D8' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E0D8' } },
        left: { style: 'thin', color: { argb: 'FFE5E0D8' } },
        right: { style: 'thin', color: { argb: 'FFE5E0D8' } },
      };
    });
  });

  // --------------------------------------------------------------------------
  // SHEETS 2+: One Sheet Per Section (Dynamic Periods, No Hard-coded 6)
  // --------------------------------------------------------------------------
  SECTIONS.forEach(sec => {
    const secBatches = sectionedBatches[sec.id] || [];
    if (secBatches.length === 0) return;

    // Sanitize worksheet title (Excel prohibits * ? : \ / [ ] and max 31 chars)
    const safeSheetName = sec.label
      .replace(/Building\s*/gi, 'B')
      .replace(/PUC|PU/gi, 'PU')
      .replace(/[:*?\\/[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31);

    const worksheet = workbook.addWorksheet(safeSheetName, {
      pageSetup: { orientation: 'landscape', paperSize: 9 },
    });

    // Determine max periods strictly across batches in this section
    const maxSectionPeriods = Math.max(...secBatches.map(b => b.periods.length), 1);

    // Columns config
    const columns: { header: string; key: string; width: number }[] = [
      { header: 'Building', key: 'building', width: 14 },
      { header: 'Academic Track', key: 'category', width: 18 },
      { header: 'Batch Name', key: 'batchName', width: 22 },
      { header: 'Room No.', key: 'room', width: 12 },
    ];

    for (let p = 0; p < maxSectionPeriods; p++) {
      const sampleTiming = secBatches.find(b => b.periods[p]?.startTime)?.periods[p];
      const timingSuffix = sampleTiming?.startTime
        ? ` (${sampleTiming.startTime} - ${sampleTiming.endTime})`
        : '';
      columns.push({
        header: `Period ${p + 1}${timingSuffix}`,
        key: `p_${p}`,
        width: 25,
      });
    }

    worksheet.columns = columns;

    // Header styling
    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF6B2638' }, // Brand Burgundy
    };

    // Populate batch rows
    secBatches.forEach((batch, bIdx) => {
      const rowData: Record<string, string> = {
        building: batch.building,
        category: batch.yearCategory,
        batchName: batch.name,
        room: batch.roomNumber || '-',
      };

      for (let p = 0; p < maxSectionPeriods; p++) {
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
          const overrideMark = alloc.overridden ? ' [OVERRIDE]' : '';
          rowData[`p_${p}`] = `${alloc.subject} - ${facName}${lockMark}${overrideMark}`;
        }
      }

      const row = worksheet.addRow(rowData);
      row.height = 22;
      row.alignment = { vertical: 'middle' };

      // Zebra striping
      if (bIdx % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFDFBF7' },
        };
      }

      // Border styling
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E0D8' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E0D8' } },
          left: { style: 'thin', color: { argb: 'FFE5E0D8' } },
          right: { style: 'thin', color: { argb: 'FFE5E0D8' } },
        };
      });
    });
  });

  return workbook;
};

/**
 * Modern Excel Export using ExcelJS
 * Saves workbook to browser download.
 */
export const exportTimetableToExcel = async (
  day: DayOfWeek,
  batches: Batch[],
  allocations: Allocation[],
  faculties: Faculty[],
  status: TimetableStatus = 'Draft'
): Promise<void> => {
  const workbook = buildTimetableWorkbook(day, batches, allocations, faculties, status);
  const buffer = await workbook.xlsx.writeBuffer();

  if (typeof document !== 'undefined') {
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
  }
};

/**
 * Builds a vector PDF document using jsPDF + jspdf-autotable.
 * Features:
 * 1. Real selectable, searchable text with proper typography.
 * 2. Proper pagination: iterates through each section with clean page breaks.
 * 3. Header on each page with Academic Day, Status, Section Name, and timestamp.
 * 4. A4 Landscape layout with optimal cell padding and text wrapping.
 */
export const buildTimetablePdf = (
  day: DayOfWeek,
  batches: Batch[],
  allocations: Allocation[],
  faculties: Faculty[],
  status: TimetableStatus = 'Draft'
): jsPDF => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const sectionedBatches = groupBatchesBySection(batches);
  const activeSections = SECTIONS.filter(s => (sectionedBatches[s.id] || []).length > 0);
  const exportDate = new Date().toLocaleDateString();

  activeSections.forEach((sec, sectionIndex) => {
    const secBatches = sectionedBatches[sec.id] || [];
    if (secBatches.length === 0) return;

    if (sectionIndex > 0) {
      doc.addPage();
    }

    // Top Brand Accent Line (Brushed Gold Accent)
    doc.setFillColor(176, 138, 74); // Gold #B08A4A
    doc.rect(30, 24, 782, 3, 'F');

    // Header Content
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(42, 40, 38); // Deep Charcoal #2A2826
    doc.text('TIMETABLE PRO — ACADEMIC SCHEDULE', 30, 44);

    doc.setFontSize(11);
    doc.setTextColor(42, 40, 38); // Deep Charcoal #2A2826
    doc.text(sec.label, 30, 59);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110, 101, 89); // Taupe Muted #6E6559
    const metaString = `Day: ${day}   |   Status: ${status}   |   Batches: ${secBatches.length}   |   Export Date: ${exportDate}`;
    doc.text(metaString, 30, 72);

    // Calculate max periods in this section
    const maxSectionPeriods = Math.max(...secBatches.map(b => b.periods.length), 1);

    // Build column headers
    const headRow: string[] = ['Batch Name', 'Room', 'Track'];
    for (let p = 0; p < maxSectionPeriods; p++) {
      const sampleTiming = secBatches.find(b => b.periods[p]?.startTime)?.periods[p];
      const timeStr = sampleTiming?.startTime
        ? `\n${sampleTiming.startTime}-${sampleTiming.endTime}`
        : '';
      headRow.push(`Period ${p + 1}${timeStr}`);
    }

    // Build body rows
    const bodyRows: string[][] = secBatches.map(batch => {
      const row: string[] = [
        batch.name,
        batch.roomNumber ? `Rm ${batch.roomNumber}` : '-',
        batch.yearCategory,
      ];

      for (let p = 0; p < maxSectionPeriods; p++) {
        const timing = batch.periods[p];
        const alloc = allocations.find(a => a.batchId === batch.id && a.periodIndex === p);

        if (!timing || !timing.startTime) {
          row.push('—');
        } else if (!alloc || !alloc.facultyId) {
          if (alloc && alloc.vacatedFacultyId) {
            row.push(`[GAP]\n${alloc.subject}`);
          } else {
            row.push('Free');
          }
        } else {
          const fac = faculties.find(f => f.id === alloc.facultyId);
          const facName = fac?.name || alloc.facultyId;
          const flags = `${alloc.frozen ? ' [L]' : ''}${alloc.overridden ? ' [O]' : ''}`;
          row.push(`${alloc.subject}\n${facName}${flags}`);
        }
      }

      return row;
    });

    // Render Table via autoTable
    autoTable(doc, {
      startY: 80,
      margin: { left: 30, right: 30, top: 80, bottom: 35 },
      head: [headRow],
      body: bodyRows,
      theme: 'grid',
      headStyles: {
        fillColor: [42, 40, 38], // #2A2826 Deep Charcoal
        textColor: [245, 240, 232], // #F5F0E8 Canvas Warm Beige
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 3,
        lineColor: [220, 210, 193], // #DCD2C1 Border
        lineWidth: 0.5,
        valign: 'middle',
        halign: 'center',
        overflow: 'linebreak',
        textColor: [42, 40, 38], // #2A2826 Ink
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', minCellWidth: 65 },
        1: { halign: 'center', minCellWidth: 35 },
        2: { halign: 'center', minCellWidth: 45 },
      },
      alternateRowStyles: {
        fillColor: [245, 240, 232], // #F5F0E8 Canvas Warm Beige
      },
      didDrawPage: data => {
        // Footer pagination
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(110, 101, 89);
        const pageNumber = `Timetable Pro  ·  ${sec.label}  ·  Page ${data.pageNumber}`;
        doc.text(pageNumber, 421, 580, { align: 'center' });
      },
    });
  });

  return doc;
};

/**
 * Modern Vector PDF Export using jsPDF + jspdf-autotable
 * Saves document to browser download.
 */
export const exportTimetableToPdf = async (
  day: DayOfWeek,
  batches: Batch[],
  allocations: Allocation[],
  faculties: Faculty[],
  status: TimetableStatus = 'Draft'
): Promise<void> => {
  const doc = buildTimetablePdf(day, batches, allocations, faculties, status);
  doc.save(`Timetable_${day}_${new Date().toISOString().split('T')[0]}.pdf`);
};

/**
 * High-resolution PNG export of a dedicated print/export element
 * Eliminates rasterization of page headers, navigation, or interactive controls.
 */
export const exportTimetableToPng = async (
  containerElement: HTMLElement,
  day: DayOfWeek
): Promise<void> => {
  const html2canvas = (await import('html2canvas')).default;

  const canvas = await html2canvas(containerElement, {
    scale: 2,
    backgroundColor: '#F5F0E8',
    useCORS: true,
    logging: false,
    ignoreElements: element =>
      element.classList.contains('no-export') || element.classList.contains('no-print'),
  });

  const url = canvas.toDataURL('image/png');
  if (typeof document !== 'undefined') {
    const a = document.createElement('a');
    a.href = url;
    a.download = `Timetable_${day}_${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
