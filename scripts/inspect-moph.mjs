import XLSX from "xlsx";

const wb = XLSX.readFile("data/moph-sample.xls");
console.log("sheets:", wb.SheetNames.slice(0, 5));
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
console.log("rows:", rows.length);
const keys = Object.keys(rows[0] || {});
console.log("column count:", keys.length);
for (const k of keys) console.log(k);
console.log("row0:", JSON.stringify(rows[0]).slice(0, 500));
