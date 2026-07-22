import type { Faculty, Batch, PeriodTiming } from '../types';

// ==========================================
// DATA BUILDER UTILITIES
// ==========================================

// Helper to safely pad missing periods to exactly 6 slots
const createPeriods = (times: [string, string][]): PeriodTiming[] => {
  const periods = times.map(t => ({ startTime: t[0], endTime: t[1] }));
  while (periods.length < 6) {
    periods.push({ startTime: '', endTime: '' }); // Pad missing periods safely
  }
  return periods;
};

let batchIdCounter = 1;

// Helper to quickly generate multiple batches with the same timings
const makeBatches = (
  building: string,
  yearCategory: string,
  rooms: [string, string][], // Array of [Batch Name, Room Number]
  times: [string, string][]  // Array of [Start Time, End Time] in 24hr format
): Batch[] => {
  return rooms.map(([name, roomNumber]) => ({
    id: `seeded_batch_${batchIdCounter++}`,
    building,
    yearCategory,
    name,
    roomNumber,
    periods: createPeriods(times),
    // Assigning 6 default dummy subjects so the scheduler has something to render immediately
    subjects: [
      { subject: 'Physics', count: 2 },
      { subject: 'Chemistry', count: 2 },
      { subject: 'Mathematics', count: 2 }
    ]
  }));
};

// ==========================================
// MASTER TIMING PATTERNS (24-Hour Format)
// ==========================================
const TIMINGS = {
  // Building 1 Patterns
  PU1_CHARAKA: [["08:40", "10:00"], ["10:10", "11:40"], ["11:50", "13:20"], ["14:00", "15:30"], ["15:40", "17:10"]],
  PU2_AGASTYA: [["08:40", "10:10"], ["10:10", "11:40"], ["11:50", "13:20"], ["14:00", "15:30"], ["15:45", "17:15"]],
  PU2_AIIMS:   [["07:30", "09:00"], ["09:00", "10:30"], ["10:30", "12:00"], ["12:15", "13:45"], ["14:30", "16:00"], ["16:00", "17:30"]],
  NLT_BATCH:   [["08:30", "10:00"], ["10:10", "11:40"], ["12:00", "13:30"], ["14:15", "15:45"], ["16:00", "17:30"]],

  // Building 2 Patterns
  LAKSHYA_EARLY:[["07:30", "09:00"], ["09:00", "10:30"], ["10:50", "12:20"], ["13:00", "14:30"], ["14:45", "16:15"], ["16:15", "17:30"]],
  LAKSHYA_LATE: [["07:40", "09:10"], ["09:10", "10:40"], ["11:00", "12:30"], ["13:15", "14:45"], ["14:45", "16:00"], ["16:15", "17:40"]],
  VIRAT:        [["08:00", "09:30"], ["09:30", "11:00"], ["11:15", "12:45"], ["14:00", "16:00"], ["15:30", "17:30"]],
  JEE_ADV:      [["08:30", "10:30"], ["10:45", "12:45"], ["14:00", "16:00"], ["16:15", "17:30"]],
  IC_CET:       [["09:00", "10:30"], ["10:30", "12:00"], ["12:15", "13:45"], ["14:30", "16:00"], ["16:00", "17:15"]],
  PU1_S1:       [["07:30", "09:00"], ["09:00", "10:30"], ["10:50", "12:20"], ["13:05", "14:30"], ["14:45", "16:15"], ["16:15", "17:30"]],
  PU1_A1:       [["08:30", "10:30"], ["10:45", "12:45"], ["14:00", "16:00"], ["16:00", "17:30"]],
  PU1_S6:       [["08:50", "10:10"], ["10:10", "11:40"], ["12:00", "13:30"], ["14:30", "15:45"], ["15:45", "17:10"]],
  PU1_VIKRANT:  [["08:00", "09:30"], ["09:30", "11:00"], ["11:15", "12:45"], ["13:45", "15:15"], ["15:30", "17:00"]]
};

// ==========================================
// SEED DATA EXPORTS
// ==========================================

export const initialBatches: Batch[] = [
  // --- BUILDING 1 ---
  ...makeBatches("Building 1", "First PU", [
    ["Charaka", "305(B)"], ["Jeevaka", "305(A)"], ["Vagbhata", "316"], ["Sir M.V.", "317"], ["P.C. Roy", "318"]
  ], TIMINGS.PU1_CHARAKA),

  ...makeBatches("Building 1", "Second PU", [
    ["Agastya", "303"], ["Atreya", "302"], ["Raman", "306"], ["Kalam", "307"], ["C.N. Rao", "308"]
  ], TIMINGS.PU2_AGASTYA),

  ...makeBatches("Building 1", "Second PU (AIIMS)", [
    ["AIIMS Aristotle", "208(B)"], ["Newton", "209(B)"], ["Einstein", "211(B)"], 
    ["Jnana", "213(B/C)"], ["Vijnana", "207(CS)"], ["Achievers", "212(B/C)"]
  ], TIMINGS.PU2_AIIMS),

  ...makeBatches("Building 1", "NLT", [
    ["NLT Batch 1", "205(B)"], ["NLT Batch 2", "205(A)"]
  ], TIMINGS.NLT_BATCH),


  // --- BUILDING 2 ---
  ...makeBatches("Building 2", "Second PU", [
    ["AIIMS Lakshya 1", "206"], ["AIIMS Lakshya 2", "202"], ["AIIMS Lakshya 3", "203"],
    ["AIIMS Lakshya 11", "207"], ["AIIMS Lakshya 12", "302"], ["AIIMS Lakshya 13", "209"]
  ], TIMINGS.LAKSHYA_EARLY),

  ...makeBatches("Building 2", "Second PU", [
    ["AIIMS Lakshya 4", "205"], ["AIIMS Lakshya 5", "201"], ["AIIMS Lakshya 6", "215"], ["AIIMS Lakshya 7", "303"],
    ["AIIMS Lakshya 14", "212"], ["AIIMS Lakshya 15", "213"], ["AIIMS Lakshya 16", "214"]
  ], TIMINGS.LAKSHYA_LATE),

  ...makeBatches("Building 2", "Second PU", [["Virat", "108"]], TIMINGS.VIRAT),

  ...makeBatches("Building 2", "Second PU", [
    ["JEE Advanced 1", "106"], ["JEE Advanced 2", "107"], ["JEE Advanced 3", "105"], ["JEE Advanced 4", "101"]
  ], TIMINGS.JEE_ADV),

  ...makeBatches("Building 2", "Second PU", [
    ["IC 1 (CET 1)", "305"], ["IC 2 (CET 2)", "306"], ["Vijaya 1", "109"], ["Vijaya 2", "112"],
    ["Vijaya 11", "113"], ["Vijaya 12", "114"], ["Mains 1", "115"], ["Mains 2", "102"]
  ], TIMINGS.IC_CET),

  ...makeBatches("Building 2", "First PU", [
    ["S1", "506"], ["S2", "507"], ["S3", "403"], ["N1", "406"], ["N2", "407"], ["N3", "309"]
  ], TIMINGS.PU1_S1),

  ...makeBatches("Building 2", "First PU", [
    ["N4", "312"], ["N5", "501"], ["S4", "405"], ["S5", "503"]
  ], TIMINGS.LAKSHYA_LATE), // Matches Lakshya Late timing

  ...makeBatches("Building 2", "First PU", [
    ["A1", "010"], ["A2", "314"], ["A3", "409"]
  ], TIMINGS.PU1_A1),

  ...makeBatches("Building 2", "First PU", [
    ["S6", "505"], ["N6", "502"], ["M2", "315"], ["M3", "313"], ["M1", "307"], ["S7", "509"],
    ["S8", "512"], ["N7", "513"], ["N8", "514"], ["N9", "515"], ["N10", "408"], ["CET", "009"]
  ], TIMINGS.PU1_S6),

  ...makeBatches("Building 2", "First PU", [["Vikrant", "005"]], TIMINGS.PU1_VIKRANT)
];
// Helper to cleanly generate the massive faculty list
const createFaculty = (names: string[], subject: string): Faculty[] => {
  return names.map((name, index) => ({
    id: `f_${subject.substring(0, 3).toLowerCase()}_${index + 1}`,
    name,
    subjects: [subject],
    maxPeriodsPerDay: 6 // Default max limit
  }));
};

export const initialFaculty: Faculty[] = [
  // --- BIOLOGY (29) ---
  ...createFaculty([
    "DEEPA", "JOSMY", "VIDHYA GAYATHRI", "LAXMI PATIL", "APEKSHA H S", "PRATHIKSHA K", "VISHNAVI K C", "KAUSHIK S N", 
    "ABSATH", "SMITHA", "RAMYA", "APEKSHA NAIK", "SURAKSHITHA K", "JEVITA PREMA", "P PRAJVITH RAI", "PAVITHRA D BAPAT", 
    "YASHWANTH", "JANANI B V", "VINDHYA M J", "GANGADHARA V", "DR ROOPA P", "APEKSHA HEGDE", "DEEKSHITH", "VAISHNAVI", 
    "BIJU M K", "SUNIL STEPHEN", "PRIYANKA K J", "SAI SHRUTHI B", "SMITHA SHANKAR"
  ], "Biology"),

  // --- CHEMISTRY (32) ---
  ...createFaculty([
    "DEVRAJ V", "RAINA HENCIL", "JAIS ANTONY", "DR.NAGESWARA", "HARISHA", "PREETHIKA DSOUZA", "SHRIKANTH", "SURESH BABU", 
    "SHIVRAJ K", "RAM GANESH", "JINO K JOHN", "SHREESHA V G", "PRIYA K", "RAGHU BABU SAJJA", "SUKESH SHETTY", 
    "SUJIT KUMAR GIRI", "THEJASHREE", "KAVANA H V", "K SHIVA PRASAD", "DEVIPRASAD", "SEEMASHREE B M", "ASHWINI", 
    "DEEKSHITHA", "RAMYASHREE R", "SYAM PRASAD", "SANMITHA KUMARI", "BHIMANA GOWDA", "SOWJANYA SALIAN", "DEVENDRA K", 
    "PRASAD S", "SHREYA P", "SHWETHNA KUNDER"
  ], "Chemistry"),

  // --- ENGLISH (12) ---
  ...createFaculty([
    "KESHAVATHI ENG", "ANJANI", "PRABAVATHI", "RASMITHA SUVARNA", "VIDHYA", "JEEVAN PRADEEP", "RASHMI MAHESH", 
    "MILANA T M", "BHAGYALAKSHMI", "FOUZIYA D B", "VIDHYA NAVEEN", "PRAJNA K"
  ], "English"),

  // --- MATHEMATICS (22) ---
  ...createFaculty([
    "PRASADI M", "GRISHIN JAMES", "VARUN U", "NISCHITHA", "NITHA K JOY", "VAISHNAVI", "RAVIKANTH", "ASHWATHY K N", 
    "VEERANNAGALA", "PRAVEEN PATIL", "SUPREETH JAIN", "JAKAPURE", "AMITH C S", "RAMAKRISHNA", "GANESH NAIK", "PREETHI B", 
    "JISHA C P", "NITHYASHREE", "RAKESH H S", "PRIYA S S", "RAVULA RAMESH", "ROOPESH POOJARI"
  ], "Mathematics"),

  // --- PHYSICS (31) ---
  ...createFaculty([
    "SATHYANARAYANA", "PRAKRATHI", "ROSHNI", "JIGISHU M K", "MANJULA A", "MANOHAR S R", "JOSTOM", "PRIYANKA", 
    "DIVYA HEGDE", "BHAGYASHREE S", "MADHU BABU", "SUSHMITHA S", "ANASOOYA KUPPA", "VANDITHA", "SNEHA", "ASHWINI KOKADA", 
    "NETHA SHETTY", "SHRIDAR G HULLUR", "JEWEL JOSEPH", "SRIDEVI", "ASHWINI", "NIREEKSHA M RAI", "SOHAN GOWDA", 
    "Y GOWRI LAKSHMI", "SHREEKANTH K", "ROHITH", "SRINIVAS SHASTRI", "ASHIK K B", "SAJESH BABU", "AMALRAJ PANAYAN", "SHILPA K"
  ], "Physics"),

  // --- SECOND LANGUAGE (19) ---
  ...createFaculty([
    "HEMALATHA", "SANJEEV K P", "LEKHAN H K", "JAYARAM", "DR NAVEEN", "MUNNER", "DISHA G C", "ROHITH M", "SAHANA BHANDARI", 
    "HAREESHA K R", "VIDHYASHREE K R", "CHAITRA A S", "PRATHIK", "CHARAN KUMAR", "ARUN KUMAR KAN", "HARISHA DEVADIGA", 
    "USHA B K", "ROHITH HV", "THIPPE SWAMI"
  ], "Second Language")
];