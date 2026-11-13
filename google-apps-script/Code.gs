/**
 * Robin Hood Army — Attendance System
 * Google Apps Script Backend
 *
 * SETUP:
 *   1. Create a Google Sheet
 *   2. Open Extensions > Apps Script
 *   3. Paste this entire file into Code.gs
 *   4. Replace SPREADSHEET_ID below with your Sheet ID
 *   5. Run the setup() function once (creates sheets + default admin)
 *   6. Deploy > New Deployment > Web App
 *      - Execute as: Me
 *      - Who has access: Anyone
 *   7. Copy the deployment URL and paste into your frontend .env file as VITE_API_URL
 *
 * SHEET COLUMNS (Row 1 = Headers):
 *   Students:    A: Student ID | B: Name | C: Age | D: Class | E: Guardian | F: Contact | G: Emergency Contact | H: Status
 *   Attendance:  A: Date | B: Time | C: Student ID | D: Name | E: Status | F: Device | G: Marked By
 *   Users:       A: User ID | B: Name | C: Role (admin/staff) | D: PIN Hash | E: Status
 *
 * AUTH:
 *   Every request except 'login' must include userId + pin params.
 *   PINs are stored as SHA-256 hashes — never plaintext.
 *   Roles: admin (manage students/users) > staff (scan + view only).
 */

// ─── CONFIGURATION ─────────────────────────────────────────────────
const SPREADSHEET_ID = '1Qqjxf6j_q6xgpb0bojvRjLhWEtpR5QdJMFGFJ2EuhCw';
const STUDENTS_SHEET = 'Students';
const ATTENDANCE_SHEET = 'Attendance';
const USERS_SHEET = 'Users';
const CACHE_TTL = 300; // 5 minutes cache for student list
const ROLE_LEVEL = { staff: 1, admin: 2 };
const DEFAULT_ADMIN_PIN = '1234'; // Change after first login via addUser/updateUser

// ─── ENTRY POINTS ──────────────────────────────────────────────────

function doGet(e) {
  try {
    e = e || {};
    e.parameter = e.parameter || {};
    const action = e.parameter.action;

    // Login is the only unauthenticated action
    if (action === 'login') {
      return respond(login(e.parameter));
    }

    const auth = authenticate(e.parameter);
    if (!auth.success) return respond(auth);
    const user = auth.user;

    switch (action) {
      case 'getStudents':
        return respond(getStudents());
      case 'getStudent':
        return respond(getStudent(e.parameter.id));
      case 'getAttendance':
        return respond(getAttendance(e.parameter.date));
      case 'getAttendanceRange':
        return respond(getAttendanceRange(e.parameter.startDate, e.parameter.endDate));
      case 'getDashboard':
        return respond(getDashboard());
      case 'searchStudent':
        return respond(searchStudent(e.parameter.query));
      case 'getAttendanceHistory':
        return respond(getAttendanceHistory(e.parameter.id));
      case 'getUsers':
        return respond(requireAdmin(user, getUsers()));
      case 'addStudent':
      case 'updateStudent':
      case 'importStudents':
      case 'addUser':
      case 'updateUser':
        return respond({ success: false, error: 'Use POST for this action' });
      default:
        return respond({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'login') {
      return respond(login(data));
    }

    const auth = authenticate(data);
    if (!auth.success) return respond(auth);
    const user = auth.user;

    switch (action) {
      case 'markAttendance':
        return respond(markAttendance(data, user));
      case 'addStudent':
        return respond(requireAdmin(user, addStudent(data)));
      case 'updateStudent':
        return respond(requireAdmin(user, updateStudent(data)));
      case 'importStudents':
        return respond(requireAdmin(user, importStudents(data)));
      case 'addUser':
        return respond(requireAdmin(user, addUser(data)));
      case 'updateUser':
        return respond(requireAdmin(user, updateUser(data)));
      case 'getStudents':
        return respond(getStudents());
      default:
        return respond({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

// ─── RESPONSE HELPER ───────────────────────────────────────────────

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── STUDENT FUNCTIONS ─────────────────────────────────────────────

function getStudents() {
  // Check cache first
  var cache = CacheService.getScriptCache();
  var cached = cache.get('all_students');
  if (cached) {
    return { success: true, data: JSON.parse(cached) };
  }

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(STUDENTS_SHEET);
  var data = sheet.getDataRange().getValues();
  var students = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue; // Skip empty rows

    students.push({
      id: String(row[0]).trim(),
      name: String(row[1]).trim(),
      age: Number(row[2]) || 0,
      class: String(row[3]).trim(),
      guardian: String(row[4]).trim(),
      contact: String(row[5]).trim(),
      emergencyContact: String(row[6]).trim(),
      status: String(row[7]).trim() || 'Active'
    });
  }

  // Cache for 5 minutes
  cache.put('all_students', JSON.stringify(students), CACHE_TTL);

  return { success: true, data: students };
}

function getStudent(id) {
  if (!id) return { success: false, error: 'Student ID is required' };

  id = sanitize(id).toUpperCase();
  var result = getStudents();
  if (!result.success) return result;

  var student = result.data.find(function(s) { return s.id === id; });
  if (!student) return { success: false, error: 'Student not found: ' + id };

  return { success: true, data: student };
}

function searchStudent(query) {
  if (!query) return { success: false, error: 'Search query is required' };

  query = sanitize(query).toLowerCase();
  var result = getStudents();
  if (!result.success) return result;

  var matches = result.data.filter(function(s) {
    return s.id.toLowerCase().indexOf(query) !== -1 ||
           s.name.toLowerCase().indexOf(query) !== -1;
  });

  return { success: true, data: matches };
}

// ─── ATTENDANCE FUNCTIONS ──────────────────────────────────────────

function markAttendance(data, user) {
  // Validate input
  var studentId = sanitize(data.studentId || '').toUpperCase();
  var date = sanitize(data.date || '');
  var time = sanitize(data.time || '');
  var deviceName = sanitize(data.deviceName || 'Unknown');
  var markedBy = sanitize(data.markedBy || user.name || user.id);

  if (!studentId) return { success: false, error: 'Student ID is required' };
  if (!date) return { success: false, error: 'Date is required' };
  if (!time) return { success: false, error: 'Time is required' };

  // Validate student ID format
  if (!/^RHA\d{3,}$/i.test(studentId)) {
    return { success: false, error: 'Invalid student ID format' };
  }

  // Verify student exists
  var studentResult = getStudent(studentId);
  if (!studentResult.success) return studentResult;
  var student = studentResult.data;

  // Check if student is active
  if (student.status !== 'Active') {
    return { success: false, error: 'Student is inactive: ' + studentId };
  }

  // Check for duplicate (same student + same date)
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ATTENDANCE_SHEET);
  var existingData = sheet.getDataRange().getValues();

  for (var i = 1; i < existingData.length; i++) {
    var row = existingData[i];
    var existingDate = '';

    // Handle Date objects from Sheets
    if (row[0] instanceof Date) {
      existingDate = Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      existingDate = String(row[0]).trim();
    }

    var existingId = String(row[2]).trim().toUpperCase();

    if (existingDate === date && existingId === studentId) {
      return { success: false, error: 'Attendance already recorded for this student today' };
    }
  }

  // Record attendance (col G = marked by user)
  sheet.appendRow([date, time, studentId, student.name, 'Present', deviceName, markedBy]);

  return {
    success: true,
    data: { studentName: student.name },
    message: 'Attendance marked successfully'
  };
}

function getAttendance(date) {
  if (!date) return { success: false, error: 'Date is required' };
  date = sanitize(date);

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ATTENDANCE_SHEET);
  var data = sheet.getDataRange().getValues();
  var records = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowDate = '';

    if (row[0] instanceof Date) {
      rowDate = Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      rowDate = String(row[0]).trim();
    }

    if (rowDate === date) {
      records.push({
        date: rowDate,
        time: String(row[1]).trim(),
        studentId: String(row[2]).trim(),
        name: String(row[3]).trim(),
        status: String(row[4]).trim(),
        deviceName: String(row[5] || '').trim(),
        markedBy: String(row[6] || '').trim()
      });
    }
  }

  return { success: true, data: records };
}

function getAttendanceRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return { success: false, error: 'Start date and end date are required' };
  }

  startDate = sanitize(startDate);
  endDate = sanitize(endDate);

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ATTENDANCE_SHEET);
  var data = sheet.getDataRange().getValues();
  var records = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowDate = '';

    if (row[0] instanceof Date) {
      rowDate = Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      rowDate = String(row[0]).trim();
    }

    if (rowDate >= startDate && rowDate <= endDate) {
      records.push({
        date: rowDate,
        time: String(row[1]).trim(),
        studentId: String(row[2]).trim(),
        name: String(row[3]).trim(),
        status: String(row[4]).trim(),
        deviceName: String(row[5] || '').trim(),
        markedBy: String(row[6] || '').trim()
      });
    }
  }

  // Sort by date descending, then time descending
  records.sort(function(a, b) {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.time.localeCompare(a.time);
  });

  return { success: true, data: records };
}

function getAttendanceHistory(id) {
  if (!id) return { success: false, error: 'Student ID is required' };

  id = sanitize(id).toUpperCase();

  // Get student info
  var studentResult = getStudent(id);
  if (!studentResult.success) return studentResult;
  var student = studentResult.data;

  // Get all attendance for this student
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ATTENDANCE_SHEET);
  var data = sheet.getDataRange().getValues();
  var history = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var existingId = String(row[2]).trim().toUpperCase();

    if (existingId === id) {
      var rowDate = '';
      if (row[0] instanceof Date) {
        rowDate = Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else {
        rowDate = String(row[0]).trim();
      }

      history.push({
        date: rowDate,
        time: String(row[1]).trim(),
        studentId: existingId,
        name: String(row[3]).trim(),
        status: String(row[4]).trim(),
        deviceName: String(row[5] || '').trim(),
        markedBy: String(row[6] || '').trim()
      });
    }
  }

  // Sort by date descending
  history.sort(function(a, b) { return b.date.localeCompare(a.date); });

  // Calculate stats
  var totalSchoolDays = getUniqueSchoolDays();
  var presentDays = history.length;
  var percentage = totalSchoolDays > 0 ? (presentDays / totalSchoolDays) * 100 : 0;

  return {
    success: true,
    data: {
      student: student,
      attendanceHistory: history,
      attendancePercentage: Math.round(percentage * 10) / 10,
      lastAttendance: history.length > 0 ? history[0].date : null,
      totalDays: totalSchoolDays,
      presentDays: presentDays
    }
  };
}

// ─── DASHBOARD ─────────────────────────────────────────────────────

function getDashboard() {
  var studentsResult = getStudents();
  if (!studentsResult.success) return studentsResult;

  var students = studentsResult.data;
  var activeStudents = students.filter(function(s) { return s.status === 'Active'; });
  var totalStudents = activeStudents.length;

  // Today's attendance
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var todayResult = getAttendance(today);
  var todayRecords = todayResult.success ? todayResult.data : [];
  var presentToday = todayRecords.length;
  var absentToday = totalStudents - presentToday;
  var percentage = totalStudents > 0 ? (presentToday / totalStudents) * 100 : 0;

  // Weekly trend (past 7 days)
  var weeklyTrend = [];
  var daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (var d = 6; d >= 0; d--) {
    var date = new Date();
    date.setDate(date.getDate() - d);
    var dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var dayResult = getAttendance(dateStr);
    var dayCount = dayResult.success ? dayResult.data.length : 0;

    weeklyTrend.push({
      date: dateStr,
      day: daysOfWeek[date.getDay()],
      count: dayCount,
      total: totalStudents
    });
  }

  // Monthly trend (past 6 months)
  var monthlyTrend = [];
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ATTENDANCE_SHEET);
  var allData = sheet.getDataRange().getValues();

  for (var m = 5; m >= 0; m--) {
    var monthDate = new Date();
    monthDate.setMonth(monthDate.getMonth() - m);
    var monthKey = Utilities.formatDate(monthDate, Session.getScriptTimeZone(), 'yyyy-MM');
    var monthName = monthNames[monthDate.getMonth()];

    var monthRecords = 0;
    var monthDays = new Set();

    for (var i = 1; i < allData.length; i++) {
      var rowDate = '';
      if (allData[i][0] instanceof Date) {
        rowDate = Utilities.formatDate(allData[i][0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else {
        rowDate = String(allData[i][0]).trim();
      }

      if (rowDate.startsWith(monthKey)) {
        monthRecords++;
        monthDays.add(rowDate);
      }
    }

    var avgDayAttendance = monthDays.size > 0 ? monthRecords / monthDays.size : 0;
    var monthPct = totalStudents > 0 ? (avgDayAttendance / totalStudents) * 100 : 0;

    monthlyTrend.push({
      month: monthName,
      percentage: Math.round(monthPct * 10) / 10,
      present: monthRecords,
      total: totalStudents * monthDays.size
    });
  }

  return {
    success: true,
    data: {
      totalStudents: totalStudents,
      presentToday: presentToday,
      absentToday: absentToday,
      attendancePercentage: Math.round(percentage * 10) / 10,
      todayRecords: todayRecords,
      weeklyTrend: weeklyTrend,
      monthlyTrend: monthlyTrend
    }
  };
}

// ─── AUTHENTICATION & USERS ────────────────────────────────────────

function hashPin(pin) {
  var hash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(pin),
    Utilities.Charset.UTF_8
  );
  return hash.map(function(b) {
    return ('0' + ((b < 0 ? b + 256 : b).toString(16))).slice(-2);
  }).join('');
}

function getUsersSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET);
}

function getAllUsers() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('all_users');
  if (cached) return JSON.parse(cached);

  var sheet = getUsersSheet();
  var data = sheet.getDataRange().getValues();
  var users = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    users.push({
      id: String(row[0]).trim(),
      name: String(row[1]).trim(),
      role: String(row[2]).trim(),
      pinHash: String(row[3]).trim(),
      status: String(row[4]).trim() || 'Active'
    });
  }

  cache.put('all_users', JSON.stringify(users), 60); // 1 minute cache
  return users;
}

function findUser(userId) {
  userId = sanitize(String(userId || '')).toUpperCase();
  var users = getAllUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i].id === userId) return users[i];
  }
  return null;
}

function invalidateUsersCache() {
  CacheService.getScriptCache().remove('all_users');
}

/**
 * Verify userId + pin. Returns { success, user } or { success:false, error }.
 */
function authenticate(params) {
  var userId = params.userId;
  var pin = params.pin;
  if (!userId || !pin) {
    return { success: false, error: 'Login required — please sign in' };
  }

  var user = findUser(userId);
  if (!user) return { success: false, error: 'Invalid credentials' };
  if (user.status !== 'Active') return { success: false, error: 'Account is disabled' };
  if (user.pinHash !== hashPin(pin)) return { success: false, error: 'Invalid credentials' };

  return { success: true, user: user };
}

/**
 * Gate a result behind the admin role.
 * Usage: return respond(requireAdmin(user, someFunction(data)));
 */
function requireAdmin(user, result) {
  if ((ROLE_LEVEL[user.role] || 0) < ROLE_LEVEL.admin) {
    return { success: false, error: 'Admin access required' };
  }
  return result;
}

function login(params) {
  var auth = authenticate(params);
  if (!auth.success) return auth;

  return {
    success: true,
    data: {
      id: auth.user.id,
      name: auth.user.name,
      role: auth.user.role
    }
  };
}

function getUsers() {
  var users = getAllUsers().map(function(u) {
    return { id: u.id, name: u.name, role: u.role, status: u.status };
  });
  return { success: true, data: users };
}

function nextUserId() {
  var users = getAllUsers();
  var max = 0;
  users.forEach(function(u) {
    var m = u.id.match(/^U(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'U' + ('00' + (max + 1)).slice(-3);
}

function addUser(data) {
  var name = sanitize(data.name || '');
  var role = sanitize(data.role || '').toLowerCase();
  // 'newPin' is the PIN being assigned — 'pin' is reserved for caller auth
  var pin = String(data.newPin || '').trim();

  if (!name) return { success: false, error: 'Name is required' };
  if (role !== 'admin' && role !== 'staff') {
    return { success: false, error: 'Role must be "admin" or "staff"' };
  }
  if (!/^\d{4,8}$/.test(pin)) {
    return { success: false, error: 'PIN must be 4-8 digits' };
  }

  // Check duplicate name
  var existing = getAllUsers().filter(function(u) {
    return u.name.toLowerCase() === name.toLowerCase();
  });
  if (existing.length > 0) {
    return { success: false, error: 'A user named "' + name + '" already exists' };
  }

  var id = nextUserId();
  getUsersSheet().appendRow([id, name, role, hashPin(pin), 'Active']);
  invalidateUsersCache();

  return {
    success: true,
    data: { id: id, name: name, role: role, status: 'Active' },
    message: 'User ' + name + ' (' + role + ') created with ID ' + id
  };
}

function updateUser(data) {
  var userId = sanitize(String(data.id || '')).toUpperCase();
  if (!userId) return { success: false, error: 'User ID is required' };

  var sheet = getUsersSheet();
  var rows = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() === userId) {
      var name = data.name !== undefined ? sanitize(data.name) : String(rows[i][1]).trim();
      var role = data.role !== undefined ? sanitize(data.role).toLowerCase() : String(rows[i][2]).trim();
      var status = data.status !== undefined ? sanitize(data.status) : String(rows[i][4]).trim() || 'Active';

      if (!name) return { success: false, error: 'Name cannot be empty' };
      if (role !== 'admin' && role !== 'staff') {
        return { success: false, error: 'Role must be "admin" or "staff"' };
      }
      if (status !== 'Active' && status !== 'Inactive') {
        return { success: false, error: 'Status must be "Active" or "Inactive"' };
      }

      // Optionally reset PIN ('newPin' — 'pin' is the caller's auth credential)
      var pinHash = String(rows[i][3]).trim();
      if (data.newPin) {
        var pin = String(data.newPin).trim();
        if (!/^\d{4,8}$/.test(pin)) {
          return { success: false, error: 'PIN must be 4-8 digits' };
        }
        pinHash = hashPin(pin);
      }

      sheet.getRange(i + 1, 1, 1, 5).setValues([[userId, name, role, pinHash, status]]);
      invalidateUsersCache();

      return {
        success: true,
        data: { id: userId, name: name, role: role, status: status },
        message: 'User updated'
      };
    }
  }

  return { success: false, error: 'User not found: ' + userId };
}

// ─── STUDENT ADMIN (admin only) ─────────────────────────────────────

function invalidateStudentsCache() {
  CacheService.getScriptCache().remove('all_students');
}

function nextStudentId() {
  var result = getStudents();
  var max = 0;
  if (result.success) {
    result.data.forEach(function(s) {
      var m = s.id.match(/^RHA(\d+)$/i);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  return 'RHA' + ('000' + (max + 1)).slice(-3);
}

function buildStudentRow(data, fallbackId) {
  var id = data.id ? sanitize(String(data.id)).toUpperCase() : fallbackId;
  var name = sanitize(data.name || '');

  if (!/^RHA\d{3,}$/i.test(id)) {
    return { error: 'Invalid student ID format: ' + id + ' (expected RHA001)' };
  }
  if (!name) return { error: 'Name is required for ' + id };

  return {
    id: id,
    name: name,
    age: parseInt(data.age, 10) || 0,
    class: sanitize(data.class || ''),
    guardian: sanitize(data.guardian || ''),
    contact: sanitize(data.contact || ''),
    emergencyContact: sanitize(data.emergencyContact || ''),
    status: 'Active'
  };
}

function addStudent(data) {
  var student = buildStudentRow(data, nextStudentId());
  if (student.error) return { success: false, error: student.error };

  // Duplicate check
  var existing = getStudent(student.id);
  if (existing.success) {
    return { success: false, error: 'Student ID already exists: ' + student.id };
  }

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(STUDENTS_SHEET);
  sheet.appendRow([
    student.id, student.name, student.age, student.class,
    student.guardian, student.contact, student.emergencyContact, student.status
  ]);
  invalidateStudentsCache();

  return { success: true, data: student, message: 'Student ' + student.name + ' added as ' + student.id };
}

function updateStudent(data) {
  var studentId = sanitize(String(data.id || '')).toUpperCase();
  if (!studentId) return { success: false, error: 'Student ID is required' };

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(STUDENTS_SHEET);
  var rows = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() === studentId) {
      var student = buildStudentRow({
        id: studentId,
        name: data.name !== undefined ? data.name : rows[i][1],
        age: data.age !== undefined ? data.age : rows[i][2],
        class: data.class !== undefined ? data.class : rows[i][3],
        guardian: data.guardian !== undefined ? data.guardian : rows[i][4],
        contact: data.contact !== undefined ? data.contact : rows[i][5],
        emergencyContact: data.emergencyContact !== undefined ? data.emergencyContact : rows[i][6]
      }, studentId);
      if (student.error) return { success: false, error: student.error };

      var status = data.status !== undefined
        ? sanitize(data.status)
        : (String(rows[i][7]).trim() || 'Active');
      if (status !== 'Active' && status !== 'Inactive') {
        return { success: false, error: 'Status must be "Active" or "Inactive"' };
      }
      student.status = status;

      sheet.getRange(i + 1, 1, 1, 8).setValues([[
        student.id, student.name, student.age, student.class,
        student.guardian, student.contact, student.emergencyContact, student.status
      ]]);
      invalidateStudentsCache();

      return { success: true, data: student, message: 'Student ' + student.id + ' updated' };
    }
  }

  return { success: false, error: 'Student not found: ' + studentId };
}

/**
 * Bulk import. data.students = [{ name, age, class, guardian, contact, emergencyContact }]
 * IDs are auto-generated (RHA###). Rows with errors are skipped and reported.
 */
function importStudents(data) {
  var list = data.students;
  if (!Array.isArray(list) || list.length === 0) {
    return { success: false, error: 'No students provided' };
  }
  if (list.length > 500) {
    return { success: false, error: 'Too many rows — max 500 per import' };
  }

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(STUDENTS_SHEET);
  var existingIds = {};
  var result = getStudents();
  if (result.success) {
    result.data.forEach(function(s) { existingIds[s.id.toUpperCase()] = true; });
  }

  var nextId = nextStudentId();
  var counter = parseInt(nextId.replace(/\D/g, ''), 10);
  var rowsToAdd = [];
  var errors = [];

  list.forEach(function(item, idx) {
    var rowNum = idx + 2; // +2: header row + 1-based
    var name = sanitize(item && item.name || '');
    if (!name) {
      errors.push('Row ' + rowNum + ': missing name — skipped');
      return;
    }

    counter++;
    var id = 'RHA' + ('000' + counter).slice(-3);
    while (existingIds[id]) {
      counter++;
      id = 'RHA' + ('000' + counter).slice(-3);
    }
    existingIds[id] = true;

    rowsToAdd.push([
      id,
      name,
      parseInt(item.age, 10) || 0,
      sanitize(item.class || ''),
      sanitize(item.guardian || ''),
      sanitize(item.contact || ''),
      sanitize(item.emergencyContact || ''),
      'Active'
    ]);
  });

  if (rowsToAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToAdd.length, 8).setValues(rowsToAdd);
    invalidateStudentsCache();
  }

  return {
    success: true,
    data: {
      added: rowsToAdd.length,
      skipped: list.length - rowsToAdd.length,
      errors: errors
    },
    message: 'Imported ' + rowsToAdd.length + ' student(s)'
  };
}

// ─── SETUP (run once from the Apps Script editor) ───────────────────

function setup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  function ensureSheet(name, headers) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  ensureSheet(STUDENTS_SHEET, ['Student ID', 'Name', 'Age', 'Class', 'Guardian', 'Contact', 'Emergency Contact', 'Status']);
  ensureSheet(ATTENDANCE_SHEET, ['Date', 'Time', 'Student ID', 'Name', 'Status', 'Device', 'Marked By']);
  var usersSheet = ensureSheet(USERS_SHEET, ['User ID', 'Name', 'Role', 'PIN Hash', 'Status']);

  // Seed a default admin if no users exist — CHANGE THE PIN AFTER FIRST LOGIN
  if (usersSheet.getLastRow() <= 1) {
    usersSheet.appendRow(['U001', 'Admin', 'admin', hashPin(DEFAULT_ADMIN_PIN), 'Active']);
    Logger.log('Created default admin U001 with PIN ' + DEFAULT_ADMIN_PIN + ' — change it soon!');
  }

  Logger.log('setup() complete — sheets ready');
}

// ─── HELPERS ───────────────────────────────────────────────────────

function getUniqueSchoolDays() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ATTENDANCE_SHEET);
  var data = sheet.getDataRange().getValues();
  var uniqueDays = new Set();

  for (var i = 1; i < data.length; i++) {
    var rowDate = '';
    if (data[i][0] instanceof Date) {
      rowDate = Utilities.formatDate(data[i][0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      rowDate = String(data[i][0]).trim();
    }
    if (rowDate) uniqueDays.add(rowDate);
  }

  return uniqueDays.size;
}

function sanitize(input) {
  if (typeof input !== 'string') return String(input);
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"']/g, '')
    .trim();
}
