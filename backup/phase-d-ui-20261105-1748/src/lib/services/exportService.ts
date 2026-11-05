/**
 * exportService.ts — تصدير/استيراد ملفات (CSV وJSON) داخل المتصفح.
 *
 * - toCsv يضيف BOM (\uFEFF) في البداية لدعم العربية في Excel، ويقتبس الحقول
 *   التي تحتوي فاصلة/اقتباس/سطرًا جديدًا وفق RFC 4180.
 * - كل الدوال آمنة: الأخطاء تُرمى برسائل عربية واضحة بدل استثناءات غامضة.
 */

/** يحوّل صفوف البيانات إلى نص CSV مع BOM لدعم العربية في Excel. */
export function toCsv(rows: (string | number)[][]): string {
  const escapeField = (value: string | number): string => {
    const s = String(value);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const body = rows.map((row) => row.map(escapeField).join(',')).join('\r\n');
  return `\uFEFF${body}`;
}

/** ينزّل ملفًا عبر Blob + URL.createObjectURL ثم يحرر الرابط بعد التنزيل. */
export function downloadFile(filename: string, mime: string, content: string): void {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // تحرير الرابط بعد لحظة قصيرة لضمان بدء التنزيل في كل المتصفحات.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    throw new Error(
      `فشل تنزيل الملف "${filename}": ${e instanceof Error ? e.message : 'خطأ غير معروف'} — تأكد من إذن التنزيل في المتصفح ثم أعد المحاولة.`,
    );
  }
}

/** ينزّل صفوف CSV كملف بترميز UTF-8 (مع BOM داخل المحتوى نفسه). */
export function downloadCsv(rows: (string | number)[][], filename: string): void {
  downloadFile(filename, 'text/csv;charset=utf-8', toCsv(rows));
}

/** ينزّل كائنًا كملف JSON منسقًا بأسطر مقروءة. */
export function downloadJson(obj: unknown, filename: string): void {
  try {
    const text = JSON.stringify(obj, null, 2);
    downloadFile(filename, 'application/json;charset=utf-8', text);
  } catch (e) {
    throw new Error(
      `فشل تجهيز ملف JSON "${filename}": ${e instanceof Error ? e.message : 'خطأ غير معروف'} — تأكد أن البيانات قابلة للتسلسل.`,
    );
  }
}

/** يقرأ ملفًا نصيًا من إدخال المستخدم ويعيد وعدًا بمحتواه بترميز UTF-8. */
export function readTextFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () =>
        reject(new Error(`فشل قراءة الملف "${file.name}" — تأكد أنه ملف نصي سليم ثم أعد المحاولة.`));
      reader.readAsText(file, 'utf-8');
    } catch (e) {
      reject(
        new Error(`تعذّر فتح الملف "${file.name}": ${e instanceof Error ? e.message : 'خطأ غير معروف'}`),
      );
    }
  });
}
