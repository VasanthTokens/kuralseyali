import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
 
// Load .env explicitly from the server folder
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
 
const SHEET_NAME = "JobCards";
const COLUMNS = [
  "job_id",
  "customer_phone",
  "customer_name",
  "issue",
  "issue_ta",
  "location",
  "urgency",
  "requested_time",
  "raw_transcript",
  "status",
  "created_at",
  "property_type",
  "appliance_brand",
  "payment_preference",
];
// Column letters: A=job_id B=customer_phone C=customer_name D=issue E=issue_ta
// F=location G=urgency H=requested_time I=raw_transcript J=status K=created_at
// L=property_type M=appliance_brand N=payment_preference
 
function getAuth() {
  const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_PATH is not set in .env file");
  }
 
  // Resolve path relative to server folder
  const resolvedPath = path.resolve(__dirname, "..", serviceAccountPath);
  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
 
  return new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}
 
function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) {
    throw new Error("GOOGLE_SHEET_ID is not set in .env file");
  }
  return id;
}
 
async function getAllRows() {
  const auth = getAuth();
  const sheetsClient = google.sheets({ version: "v4", auth });
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${SHEET_NAME}!A2:N`,
  });
  return res.data.values || [];
}
 
function rowToObject(row) {
  const obj = {};
  COLUMNS.forEach((col, i) => {
    obj[col] = row[i] ?? "";
  });
  obj.id = obj.job_id;
  return obj;
}
 
export async function saveJobCard({ messageId, customerPhone, fields, rawTranscript }) {
  const existingRows = await getAllRows();
  const alreadyExists = existingRows.some((row) => row[0] === messageId);
 
  if (alreadyExists) {
    return { created: false, jobId: messageId };
  }
 
  const newRow = [
    messageId,
    customerPhone,
    fields.customer_name || "",
    fields.issue || "",
    fields.issue_ta || "",
    fields.location || "",
    fields.urgency || "",
    fields.requested_time || "",
    rawTranscript || "",
    "pending",
    new Date().toISOString(),
    fields.property_type || "",
    fields.appliance_brand || "",
    fields.payment_preference || "",
  ];
  const auth = getAuth();
  const sheetsClient = google.sheets({ version: "v4", auth });
 
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${SHEET_NAME}!A:N`,
    valueInputOption: "RAW",
    requestBody: { values: [newRow] },
  });
 
  return { created: true, jobId: messageId };
}
 
export async function getAllJobCards() {
  const rows = await getAllRows();
  return rows
    .map((row) => rowToObject(row))
    .reverse();
}
 
export async function updateJobStatus(jobId, status) {
  const rows = await getAllRows();
  const rowIndex = rows.findIndex((row) => row[0] === jobId);
 
  if (rowIndex === -1) {
    throw new Error(`Job ID ${jobId} not found in sheet`);
  }
 
  const sheetRowNumber = rowIndex + 2;
  // "status" is the 10th column (index 9) -> column J.
  // (Previously hardcoded as "I", which is actually raw_transcript — fixed.)
  const statusColumn = "J";
 
  const auth = getAuth();
  const sheetsClient = google.sheets({ version: "v4", auth });
 
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${SHEET_NAME}!${statusColumn}${sheetRowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status]] },
  });
 
  // Return the job's details so the caller can notify the customer
  return rowToObject(rows[rowIndex]);
}
 