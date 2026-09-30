import * as React from "react";
import * as XLSX from "xlsx";
import { ArrowLeft, CalendarIcon, Download, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import type { WorkSheet } from "xlsx";
import { Layout } from "@/components/layout";
import { Button, Card, Input } from "@/components/ui";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import {
  bindTablePaginationFooter,
  PREVIEW_TABLE_PAGE_SIZE_OPTIONS,
  usePreviewTablePagination,
} from "@/lib/table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, useLocation } from "wouter";
import { customFetch } from "@/lib/custom-fetch";
import { buildGiftApiUrl } from "@/lib/api-config";
import {
  confirmCampaignPayment,
  buildCampaignRequestBody,
  createCampaignRecord,
  getApiResponseMessage as getCampaignApiMessage,
  isApiSuccessResponse as isCampaignApiSuccess,
  requestCampaignPaymentOrder,
  unwrapCampaignIdFromResponse,
  unwrapCampaignPaymentData,
} from "@/lib/campaign-payment";
import { openCampaignRazorpayCheckout } from "@/lib/razorpay-checkout";
import { toast } from "@/hooks/use-toast";
import { formatDateRangeValue } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import { getUserDisplayName, useAuth } from "@/context/auth";
import AddIcon from "@mui/icons-material/Add";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ACTION_TOOLTIP_CLASS =
  "bg-gray-700 text-white text-sm px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200";

function parseScheduledDate(value: string): Date | undefined {
  if (!value.trim()) return undefined;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toScheduledDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatScheduledDateLabel(value: string): string {
  const date = parseScheduledDate(value);
  if (!date) return "mm/dd/yyyy";
  return formatDateRangeValue(date);
}

type RecipientRow = Record<string, string | number>;

type CampaignRecipient = {
  empId: string;
  name: string;
  email: string;
  mobile: string;
  panNumber: string;
  amount: string;
  customFields?: Record<string, string>;
};

const CORE_RECIPIENT_FIELD_KEYS = new Set<RecipientFieldKey>([
  "empId",
  "name",
  "email",
  "mobile",
  "panNumber",
  "amount",
]);

const KNOWN_RECIPIENT_API_KEYS = new Set([
  "empId",
  "employeeId",
  "name",
  "recipientName",
  "email",
  "recipientEmail",
  "mobile",
  "recipientMobile",
  "phone",
  "panNumber",
  "pan",
  "amount",
  "customFields",
]);

const RECIPIENT_DISPLAY_COLUMNS = [
  "Employee Id",
  "Name",
  "Email",
  "Phone Number",
  "Pan Number",
  "Amount",
] as const;

const RECIPIENT_COLUMN_FIELDS: {
  column: (typeof RECIPIENT_DISPLAY_COLUMNS)[number];
  field: keyof CampaignRecipient;
}[] = [
    { column: "Employee Id", field: "empId" },
    { column: "Name", field: "name" },
    { column: "Email", field: "email" },
    { column: "Phone Number", field: "mobile" },
    { column: "Pan Number", field: "panNumber" },
    { column: "Amount", field: "amount" },
  ];

const SAMPLE_RECIPIENT_ROW: CampaignRecipient = {
  empId: "EMP001",
  name: "John Doe",
  email: "john.doe@example.com",
  mobile: "9876543210",
  panNumber: "ABCDE1234F",
  amount: "10000",
};

const COLUMN_MAP_UNMAPPED = "__unmapped__";

type RecipientFieldKey = Exclude<keyof CampaignRecipient, "customFields">;

type RecipientFieldMappingConfig = {
  field: RecipientFieldKey;
  label: string;
  sampleHeaders: string[];
  required: boolean;
};

const RECIPIENT_FIELD_MAPPINGS: RecipientFieldMappingConfig[] = [
  {
    field: "empId",
    label: "Employee Id",
    sampleHeaders: ["Employee Id", "empId", "employeeId", "employee id"],
    required: true,
  },
  {
    field: "name",
    label: "Name",
    sampleHeaders: ["Participant", "Name", "name"],
    required: false,
  },
  {
    field: "email",
    label: "Email",
    sampleHeaders: ["Email", "email"],
    required: true,
  },
  {
    field: "mobile",
    label: "Phone Number",
    sampleHeaders: ["Phone Number", "mobile", "phone", "phone number"],
    required: false,
  },
  {
    field: "panNumber",
    label: "Pan Number",
    sampleHeaders: ["Pan Number", "panNumber", "pan", "PAN"],
    required: true,
  },
  {
    field: "amount",
    label: "Amount",
    sampleHeaders: ["Amount", "amount"],
    required: true,
  },
];

function normalizeHeaderKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getRowValue(row: RecipientRow, ...keys: string[]) {
  const normalizedTargets = new Set(keys.map(normalizeHeaderKey));

  for (const [key, value] of Object.entries(row)) {
    if (!normalizedTargets.has(normalizeHeaderKey(key))) continue;
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }

  return "";
}

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
const PAN_NUMBER_REGEX = /^[A-Z]{5}\d{4}[A-Z]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatIndianMobileInput(value: string) {
  return value.replace(/\D/g, "");
}
function isMobileLengthGreaterThanTen(value: string) {
  return formatIndianMobileInput(value).length > 10;
}

function formatPanNumberInput(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10);
}

function isValidIndianMobile(value: string) {
  return INDIAN_MOBILE_REGEX.test(formatIndianMobileInput(value));
}

function isValidPanNumber(value: string) {
  return PAN_NUMBER_REGEX.test(formatPanNumberInput(value));
}

function isValidRecipientEmail(value: string) {
  return EMAIL_REGEX.test(value.trim());
}

function formatRecipientField(field: keyof CampaignRecipient, value: string) {
  if (field === "mobile") return formatIndianMobileInput(value);
  if (field === "panNumber") return formatPanNumberInput(value);
  return value;
}

function normalizeRecipientFields(recipient: CampaignRecipient): CampaignRecipient {
  return {
    ...recipient,
    empId: recipient.empId.trim(),
    name: recipient.name.trim(),
    email: recipient.email.trim().toLowerCase(),
    mobile: formatIndianMobileInput(recipient.mobile),
    panNumber: formatPanNumberInput(recipient.panNumber),
    amount: recipient.amount.trim(),
  };
}

function mapRowToRecipient(row: RecipientRow): CampaignRecipient {
  return normalizeRecipientFields({
    empId: getRowValue(row, "Employee Id", "empId", "employeeId", "employee id", "empId"),
    name: getRowValue(row, "Participant", "Name", "name"),
    email: getRowValue(row, "Email", "email"),
    mobile: getRowValue(row, "Phone Number", "mobile", "phone", "phone number"),
    panNumber: getRowValue(row, "Pan Number", "panNumber", "pan", "PAN"),
    amount: getRowValue(row, "Amount", "amount"),
  });
}

function recipientToPreviewRow(recipient: CampaignRecipient): RecipientRow {
  return {
    "Employee Id": recipient.empId,
    Name: recipient.name,
    Email: recipient.email,
    "Phone Number": recipient.mobile,
    "Pan Number": recipient.panNumber,
    Amount: recipient.amount,
  };
}

function normalizeWorksheetRows(rows: unknown[]): CampaignRecipient[] {
  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          value == null ? "" : typeof value === "number" || typeof value === "string" ? value : String(value),
        ]),
      ),
    )
    .filter((row) => Object.values(row).some((value) => String(value).trim().length > 0))
    .map((row) => mapRowToRecipient(row as RecipientRow));
}

function extractUploadedHeaders(rows: RecipientRow[], sheet: WorkSheet): string[] {
  if (rows.length > 0) {
    return Object.keys(rows[0]).map((key) => key.trim()).filter(Boolean);
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerRow = matrix[0];
  if (!Array.isArray(headerRow)) return [];

  return headerRow
    .map((cell) => String(cell ?? "").trim())
    .filter(Boolean);
}

function getSampleDisplayColumnForField(field: RecipientFieldKey): string | undefined {
  return RECIPIENT_COLUMN_FIELDS.find((entry) => entry.field === field)?.column;
}

function headerMatchesSampleDisplayColumn(header: string): boolean {
  const normalizedHeader = normalizeHeaderKey(header);
  return RECIPIENT_DISPLAY_COLUMNS.some(
    (column) => normalizeHeaderKey(column) === normalizedHeader,
  );
}

function headerMatchesSystemFieldAlias(header: string): boolean {
  const normalizedHeader = normalizeHeaderKey(header);
  return RECIPIENT_FIELD_MAPPINGS.some((config) =>
    config.sampleHeaders.some((sample) => normalizeHeaderKey(sample) === normalizedHeader),
  );
}

/** Only matches when the uploaded header equals the sample Excel column label (e.g. "Employee Id"). */
function guessUploadedColumnStrict(
  config: RecipientFieldMappingConfig,
  uploadedHeaders: string[],
): string | null {
  const displayColumn = getSampleDisplayColumnForField(config.field);
  if (!displayColumn) return null;

  const targetKey = normalizeHeaderKey(displayColumn);
  for (const header of uploadedHeaders) {
    if (normalizeHeaderKey(header) === targetKey) {
      return header;
    }
  }
  return null;
}

function guessUploadedColumn(
  config: RecipientFieldMappingConfig,
  uploadedHeaders: string[],
): string | null {
  for (const header of uploadedHeaders) {
    if (config.sampleHeaders.some((sample) => normalizeHeaderKey(sample) === normalizeHeaderKey(header))) {
      return header;
    }
  }
  return null;
}

function mappedHeaderDiffersFromSampleDisplay(
  config: RecipientFieldMappingConfig,
  mappedHeader: string,
): boolean {
  const displayColumn = getSampleDisplayColumnForField(config.field);
  if (!displayColumn) return false;
  return normalizeHeaderKey(mappedHeader) !== normalizeHeaderKey(displayColumn);
}

function uploadedHeadersMatchSample(uploadedHeaders: string[]): boolean {
  const normalizedUploaded = new Set(uploadedHeaders.map(normalizeHeaderKey));
  return RECIPIENT_DISPLAY_COLUMNS.every((column) =>
    normalizedUploaded.has(normalizeHeaderKey(column)),
  );
}

function buildInitialColumnMapping(uploadedHeaders: string[]): Record<RecipientFieldKey, string> {
  const mapping = {} as Record<RecipientFieldKey, string>;
  for (const config of RECIPIENT_FIELD_MAPPINGS) {
    const strictMatch = guessUploadedColumnStrict(config, uploadedHeaders);
    if (strictMatch) {
      mapping[config.field] = strictMatch;
      continue;
    }
    mapping[config.field] = guessUploadedColumn(config, uploadedHeaders) ?? COLUMN_MAP_UNMAPPED;
  }
  return mapping;
}

function getFieldsNeedingMapping(uploadedHeaders: string[]): RecipientFieldMappingConfig[] {
  const initialMapping = buildInitialColumnMapping(uploadedHeaders);
  return RECIPIENT_FIELD_MAPPINGS.filter((config) => {
    const mappedHeader = initialMapping[config.field];
    if (mappedHeader === COLUMN_MAP_UNMAPPED) return true;
    return mappedHeaderDiffersFromSampleDisplay(config, mappedHeader);
  });
}

function getUnrecognizedUploadedHeaders(uploadedHeaders: string[]): string[] {
  return uploadedHeaders.filter(
    (header) =>
      !headerMatchesSampleDisplayColumn(header) && !headerMatchesSystemFieldAlias(header),
  );
}

function getMappedUploadedColumnHeaders(mapping: Record<RecipientFieldKey, string>): Set<string> {
  return new Set(
    Object.values(mapping).filter(
      (column): column is string => Boolean(column) && column !== COLUMN_MAP_UNMAPPED,
    ),
  );
}

/** Extra file columns that are not mapped to any system field become new table columns. */
function getNewCustomColumnHeaders(
  uploadedHeaders: string[],
  mapping: Record<RecipientFieldKey, string>,
): string[] {
  const mappedColumns = getMappedUploadedColumnHeaders(mapping);
  return getUnrecognizedUploadedHeaders(uploadedHeaders).filter(
    (header) => !mappedColumns.has(header),
  );
}

function attachCustomFieldsFromRow(
  recipient: CampaignRecipient,
  row: RecipientRow,
  customColumnHeaders: string[],
): CampaignRecipient {
  if (customColumnHeaders.length === 0) return recipient;

  const customFields: Record<string, string> = { ...(recipient.customFields ?? {}) };
  for (const header of customColumnHeaders) {
    const value = row[header];
    customFields[header] = value == null ? "" : String(value).trim();
  }

  return { ...recipient, customFields };
}

function extractCustomColumnsFromRecipients(recipients: CampaignRecipient[]): string[] {
  const columns = new Set<string>();
  for (const recipient of recipients) {
    for (const key of Object.keys(recipient.customFields ?? {})) {
      columns.add(key);
    }
  }
  return Array.from(columns);
}

function importMappedRecipients(
  rows: RecipientRow[],
  uploadedHeaders: string[],
  file: File,
  finish: (parsed: CampaignRecipient[], file: File, customColumns: string[]) => void,
  onError: (message: string) => void,
): boolean {
  const mapping = buildInitialColumnMapping(uploadedHeaders);
  const customColumnHeaders = getNewCustomColumnHeaders(uploadedHeaders, mapping);
  const parsedRecipients = applyColumnMapping(rows, mapping, {}, customColumnHeaders);
  const validationErrors = validateRecipients(parsedRecipients);
  finish(parsedRecipients, file, customColumnHeaders);

  if (validationErrors.length > 0) {
    onError(formatValidationErrorsForToast(validationErrors));
    return false;
  }

  return true;
}

function getMappedCellValue(
  row: RecipientRow,
  uploadedColumn: string,
  defaultValue: string,
): string {
  if (uploadedColumn && uploadedColumn !== COLUMN_MAP_UNMAPPED) {
    const value = row[uploadedColumn];
    if (value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return defaultValue.trim();
}

function applyColumnMapping(
  rows: RecipientRow[],
  mapping: Record<RecipientFieldKey, string>,
  defaults: Partial<Record<RecipientFieldKey, string>>,
  customColumnHeaders: string[] = [],
): CampaignRecipient[] {
  return rows
    .filter((row) => Object.values(row).some((value) => String(value).trim().length > 0))
    .map((row) =>
      attachCustomFieldsFromRow(
        normalizeRecipientFields({
          empId: getMappedCellValue(row, mapping.empId, defaults.empId ?? ""),
          name: getMappedCellValue(row, mapping.name, defaults.name ?? ""),
          email: getMappedCellValue(row, mapping.email, defaults.email ?? ""),
          mobile: getMappedCellValue(row, mapping.mobile, defaults.mobile ?? ""),
          panNumber: getMappedCellValue(row, mapping.panNumber, defaults.panNumber ?? ""),
          amount: getMappedCellValue(row, mapping.amount, defaults.amount ?? ""),
        }),
        row,
        customColumnHeaders,
      ),
    );
}

function clearUploadInput(fileInputRef: React.RefObject<HTMLInputElement | null>) {
  if (fileInputRef.current) {
    fileInputRef.current.value = "";
  }
}

function parseRecipientAmount(value: string) {
  const amount = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(amount) ? amount : NaN;
}

function validateRecipient(recipient: CampaignRecipient, rowNumber: number) {
  const errors: string[] = [];
  const normalized = normalizeRecipientFields(recipient);

  if (!normalized.empId) {
    errors.push(`Row ${rowNumber}: Employee Id is required`);
  }
  if (!normalized.name) {
    errors.push(`Row ${rowNumber}: Name is required`);
  }
  if (!normalized.email) {
    errors.push(`Row ${rowNumber}: Email is required`);
  } else if (!isValidRecipientEmail(normalized.email)) {
    errors.push(`Row ${rowNumber}: Email format is invalid`);
  }
  if (!normalized.panNumber) {
    errors.push(`Row ${rowNumber}: Pan Number is required`);
  } else if (!isValidPanNumber(normalized.panNumber)) {
    errors.push(`Row ${rowNumber}: Pan Number must be in format ABCDE1234F`);
  }
  if (!normalized.mobile) {
    errors.push(`Row ${rowNumber}: Phone Number is required`);
  } else if (isMobileLengthGreaterThanTen(recipient.mobile)) {
    errors.push(`Row ${rowNumber}: Phone Number must not be greater than 10 digits`);
  } else if (!isValidIndianMobile(normalized.mobile)) {
    errors.push(`Row ${rowNumber}: Phone Number must be a valid 10-digit Indian mobile number`);
  }
  if (!normalized.amount) {
    errors.push(`Row ${rowNumber}: Amount is required`);
  } else if (!Number.isFinite(parseRecipientAmount(normalized.amount)) || parseRecipientAmount(normalized.amount) <= 0) {
    errors.push(`Row ${rowNumber}: Amount must be a valid number greater than 0`);
  }

  return errors;
}

function withoutRowPrefix(message: string) {
  return message.replace(/^Row\s*\d+\s*:\s*/i, "").trim();
}

function formatValidationErrorsForToast(errors: string[], limit = 3) {
  return errors
    .slice(0, limit)
    .map((message) => withoutRowPrefix(message))
    .join(". ");
}

function validateRecipients(recipients: CampaignRecipient[]) {
  const errors = recipients.flatMap((recipient, index) => validateRecipient(recipient, index + 1));
  const normalizedRecipients = recipients.map((recipient) => normalizeRecipientFields(recipient));

  const duplicateCheckConfig: Array<{
    field: keyof CampaignRecipient;
    label: string;
  }> = [
      { field: "empId", label: "Employee Id" },
      { field: "email", label: "Email" },
      { field: "mobile", label: "Phone Number" },
    ];

  for (const { field, label } of duplicateCheckConfig) {
    const valueToRows = new Map<string, number[]>();

    normalizedRecipients.forEach((recipient, index) => {
      const rawValue = recipient[field];
      const value = String(rawValue ?? "").trim();
      if (!value) return;

      const existingRows = valueToRows.get(value) ?? [];
      existingRows.push(index + 1);
      valueToRows.set(value, existingRows);
    });

    let hasDuplicateForField = false;
    for (const rows of valueToRows.values()) {
      if (rows.length > 1) {
        hasDuplicateForField = true;
        break;
      }
    }

    if (hasDuplicateForField) {
      errors.push(`${label} is duplicated`);
    }
  }

  return errors;
}

function getRecipientFieldErrors(recipient: CampaignRecipient): AddUserFieldErrors {
  const normalized = normalizeRecipientFields(recipient);
  const errors: AddUserFieldErrors = {};

  if (!normalized.empId) errors.empId = "Employee Id is required";
  if (!normalized.name) errors.name = "Participant is required";
  if (!normalized.email) {
    errors.email = "Email is required";
  } else if (!isValidRecipientEmail(normalized.email)) {
    errors.email = "Email format is invalid";
  }
  if (!normalized.mobile) {
    errors.mobile = "Phone Number is required";
  } else if (isMobileLengthGreaterThanTen(recipient.mobile)) {
    errors.mobile = "Phone Number must not be greater than 10 digits";
  } else if (!isValidIndianMobile(normalized.mobile)) {
    errors.mobile = "Phone Number must be a valid 10-digit Indian mobile number";
  }
  if (!normalized.panNumber) {
    errors.panNumber = "Pan Number is required";
  } else if (!isValidPanNumber(normalized.panNumber)) {
    errors.panNumber = "Pan Number must be in format ABCDE1234F";
  }
  if (!normalized.amount) {
    errors.amount = "Amount is required";
  } else if (!Number.isFinite(parseRecipientAmount(normalized.amount)) || parseRecipientAmount(normalized.amount) <= 0) {
    errors.amount = "Amount must be a valid number greater than 0";
  }

  return errors;
}

function buildRecipientFieldErrors(recipients: CampaignRecipient[]): AddUserFieldErrors[] {
  const normalizedRecipients = recipients.map((recipient) => normalizeRecipientFields(recipient));
  const rowErrors = normalizedRecipients.map((recipient) => getRecipientFieldErrors(recipient));

  const duplicateCheckConfig: Array<{
    field: keyof CampaignRecipient;
    label: string;
  }> = [
      { field: "empId", label: "Employee Id" },
      { field: "email", label: "Email" },
      { field: "mobile", label: "Phone Number" },
    ];

  for (const { field, label } of duplicateCheckConfig) {
    const rowsByValue = new Map<string, number[]>();

    normalizedRecipients.forEach((recipient, index) => {
      const value = String(recipient[field] ?? "").trim();
      if (!value) return;
      const rows = rowsByValue.get(value) ?? [];
      rows.push(index);
      rowsByValue.set(value, rows);
    });

    for (const rows of rowsByValue.values()) {
      if (rows.length <= 1) continue;
      for (const rowIndex of rows) {
        rowErrors[rowIndex] = {
          ...rowErrors[rowIndex],
          [field]: `${label} is duplicated`,
        };
      }
    }
  }

  return rowErrors;
}

type CampaignFormField = "name" | "assetType" | "scheduledDate" | "recipients";

type CampaignFormErrors = Partial<Record<CampaignFormField, string>>;
type AddUserFieldErrors = Partial<Record<keyof CampaignRecipient, string>>;

function validateCampaignForm(
  formData: { name: string; assetType: string; scheduledDate: string },
  recipients: CampaignRecipient[],
): CampaignFormErrors {
  const errors: CampaignFormErrors = {};

  if (!formData.name.trim()) {
    errors.name = "Campaign name is required";
  }
  if (!formData.assetType.trim()) {
    errors.assetType = "Asset type is required";
  }
  if (!formData.scheduledDate.trim()) {
    errors.scheduledDate = "Scheduled date is required";
  }
  if (recipients.length === 0) {
    errors.recipients = "Upload participants file is required";
  }

  return errors;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function recipientMatchesSearch(recipient: CampaignRecipient, normalizedTerm: string) {
  if (!normalizedTerm) return true;

  const haystack = [
    recipient.empId,
    recipient.name,
    recipient.email,
    recipient.mobile,
    recipient.panNumber,
    recipient.amount,
    ...Object.values(recipient.customFields ?? {}),
  ]
    .map((value) => String(value).trim().toLowerCase())
    .join(" ");

  return haystack.includes(normalizedTerm);
}

function downloadSampleRecipientExcel() {
  const worksheet = XLSX.utils.json_to_sheet([recipientToPreviewRow(SAMPLE_RECIPIENT_ROW)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Participants");
  XLSX.writeFile(workbook, "campaign-participants-sample.xlsx");
}

function mapApiRecipientToForm(recipient: Record<string, unknown>): CampaignRecipient {
  const core = normalizeRecipientFields({
    empId: String(recipient.empId ?? recipient.employeeId ?? ""),
    name: String(recipient.name ?? recipient.recipientName ?? ""),
    email: String(recipient.email ?? recipient.recipientEmail ?? ""),
    mobile: String(recipient.mobile ?? recipient.recipientMobile ?? recipient.phone ?? ""),
    panNumber: String(recipient.panNumber ?? recipient.pan ?? ""),
    amount: recipient.amount != null ? String(recipient.amount) : "",
  });

  const customFields: Record<string, string> = {};
  const nestedCustom = recipient.customFields;
  if (nestedCustom && typeof nestedCustom === "object" && !Array.isArray(nestedCustom)) {
    for (const [key, value] of Object.entries(nestedCustom as Record<string, unknown>)) {
      customFields[key] = value == null ? "" : String(value).trim();
    }
  }

  for (const [key, value] of Object.entries(recipient)) {
    if (KNOWN_RECIPIENT_API_KEYS.has(key)) continue;
    customFields[key] = value == null ? "" : String(value).trim();
  }

  return Object.keys(customFields).length > 0 ? { ...core, customFields } : core;
}

function isApiSuccessResponse(res: unknown): boolean {
  if (!res || typeof res !== "object") return false;
  const record = res as Record<string, unknown>;
  if (record.success === true) return true;
  if (record.status === true) return true;
  if (record.status === "true") return true;
  return false;
}

function getApiResponseMessage(res: unknown, fallback: string): string {
  if (!res || typeof res !== "object") return fallback;
  const message = (res as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function unwrapCampaignFromResponse(res: unknown): Record<string, unknown> | null {
  if (!res || typeof res !== "object") return null;
  const record = res as Record<string, unknown>;
  const data = record.data;

  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }

  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }

  return null;
}

function unwrapCampaignRecipients(campaign: Record<string, unknown>): CampaignRecipient[] {
  const recipients = campaign.recipients;
  if (!Array.isArray(recipients)) return [];

  return recipients
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((recipient) => mapApiRecipientToForm(recipient));
}

export default function CreateCampaign() {
  const { user } = useAuth();
  const loggedInUserId = React.useMemo(() => {
    if (user?.id?.trim()) return user.id.trim();
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem("id")?.trim() ?? "";
    } catch {
      return "";
    }
  }, [user?.id]);
  const [recipients, setRecipients] = React.useState<CampaignRecipient[]>([]);
  const [fileName, setFileName] = React.useState("");
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
  const [uploadedAt, setUploadedAt] = React.useState<string | null>(null);
  const [recipientSearchTerm, setRecipientSearchTerm] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [location, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const isEdit = params.get("edit") === "true";
  const campaignId = params.get("id");
  const [addOpen, setAddOpen] = React.useState(false);
  const [isGlobalEditing, setIsGlobalEditing] = React.useState(false);
  const [editSnapshot, setEditSnapshot] = React.useState<CampaignRecipient[] | null>(null);
  const [newUser, setNewUser] = React.useState<CampaignRecipient>({
    empId: "",
    name: "",
    email: "",
    mobile: "",
    panNumber: "",
    amount: "",
  });
  const [addUserFieldErrors, setAddUserFieldErrors] = React.useState<AddUserFieldErrors>({});
  const [deleteUserOpen, setDeleteUserOpen] = React.useState(false);
  const [selectedUserIndex, setSelectedUserIndex] = React.useState<number | null>(null);
  const [isSavingDraft, setIsSavingDraft] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoadingCampaign, setIsLoadingCampaign] = React.useState(false);
  const [mappingOpen, setMappingOpen] = React.useState(false);
  const [pendingUploadRows, setPendingUploadRows] = React.useState<RecipientRow[]>([]);
  const [pendingUploadFile, setPendingUploadFile] = React.useState<File | null>(null);
  const [pendingUploadHeaders, setPendingUploadHeaders] = React.useState<string[]>([]);
  const [columnMapping, setColumnMapping] = React.useState<Record<RecipientFieldKey, string>>({
    empId: COLUMN_MAP_UNMAPPED,
    name: COLUMN_MAP_UNMAPPED,
    email: COLUMN_MAP_UNMAPPED,
    mobile: COLUMN_MAP_UNMAPPED,
    panNumber: COLUMN_MAP_UNMAPPED,
    amount: COLUMN_MAP_UNMAPPED,
  });
  const [columnDefaults, setColumnDefaults] = React.useState<
    Partial<Record<RecipientFieldKey, string>>
  >({});

  const [mappingDialogFields, setMappingDialogFields] = React.useState<RecipientFieldKey[]>([]);
  const [customColumns, setCustomColumns] = React.useState<string[]>([]);
  const previewColumns = React.useMemo(
    () => [...RECIPIENT_DISPLAY_COLUMNS, ...customColumns],
    [customColumns],
  );
  const filteredRecipientEntries = React.useMemo(() => {
    const term = recipientSearchTerm.trim().toLowerCase();
    return recipients
      .map((recipient, index) => ({ recipient, index }))
      .filter(({ recipient }) => recipientMatchesSearch(recipient, term));
  }, [recipients, recipientSearchTerm]);

  const pagination = usePreviewTablePagination(filteredRecipientEntries);
  const showRecipientsTable = recipients.length > 0 || isEdit;
  const isCreateFlowLocked = isEdit || isGlobalEditing;
  const buildEmptyCustomFields = React.useCallback(
    () =>
      customColumns.reduce<Record<string, string>>((acc, column) => {
        acc[column] = "";
        return acc;
      }, {}),
    [customColumns],
  );
  const [formData, setFormData] = React.useState({
    name: "",
    assetType: "",
    scheduledDate: "",
  });
  const [scheduledDatePopoverOpen, setScheduledDatePopoverOpen] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<CampaignFormErrors>({});
  const recipientFieldErrors = React.useMemo(
    () => buildRecipientFieldErrors(recipients),
    [recipients],
  );

  const clearFieldError = (field: CampaignFormField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };
  React.useEffect(() => {
    const fetchCampaign = async () => {
      if (!isEdit || !campaignId) return;

      setIsLoadingCampaign(true);
      try {
        const res = await customFetch(
          buildGiftApiUrl(`/campaign/getCampaigns/${campaignId}`),
          { method: "GET" },
        );

        if (!isApiSuccessResponse(res)) {
          toast({
            title: "Error",
            description: getApiResponseMessage(res, "Failed to load campaign"),
            variant: "destructive",
          });
          return;
        }

        const data = unwrapCampaignFromResponse(res);
        if (!data) return;

        setFormData({
          name: String(data.campaignName ?? ""),
          assetType: String(data.assetType ?? ""),
          scheduledDate:
            typeof data.scheduledDate === "string" ? data.scheduledDate.split("T")[0] : "",
        });
        const loadedRecipients = unwrapCampaignRecipients(data);
        setRecipients(loadedRecipients);
        setCustomColumns(extractCustomColumnsFromRecipients(loadedRecipients));      
        const apiUploadedAt =
          typeof data.uploadedAt === "string"
            ? data.uploadedAt
            : data.uploadedAt instanceof Date
              ? data.uploadedAt.toISOString()
              : null;
        if (apiUploadedAt) {
          setUploadedAt(apiUploadedAt);
        }
      } catch (err) {
        console.error(err);
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to load campaign",
          variant: "destructive",
        });
      } finally {
        setIsLoadingCampaign(false);
      }
    };
    void fetchCampaign();
  }, [isEdit, campaignId]);

  React.useEffect(() => {
    pagination.resetPage();
  }, [pagination.resetPage, recipientSearchTerm]);

  const resetPendingUpload = React.useCallback(() => {
    setPendingUploadRows([]);
    setPendingUploadFile(null);
    setPendingUploadHeaders([]);
    setColumnMapping(buildInitialColumnMapping([]));
    setColumnDefaults({});
    setMappingDialogFields([]);
  }, []);

  const finishRecipientsImport = React.useCallback(
    (
      parsedRecipients: CampaignRecipient[],
      file: File,
      importedCustomColumns: string[] = [],
    ) => {
      setFileName(file.name);
      setUploadedFile(file);
      setUploadedAt(new Date().toISOString());
      setCustomColumns(importedCustomColumns);
      setRecipients(parsedRecipients.map((recipient) => normalizeRecipientFields(recipient)));
      pagination.resetPage();
    },
    [pagination.resetPage],
  );

  const showRecipientsValidationIssues = React.useCallback(
    (parsedRecipients: CampaignRecipient[], message: string) => {
      setFieldErrors((prev) => ({
        ...prev,
        recipients: message,
      }));
      setEditSnapshot(parsedRecipients.map((recipient) => ({ ...recipient })));
      setIsGlobalEditing(true);
    },
    [],
  );

  const clearParticipantUploadState = React.useCallback(() => {
    setFileName("");
    setUploadedFile(null);
    setUploadedAt(null);
    setCustomColumns([]);
    setRecipientSearchTerm("");
    pagination.resetPage();
    clearUploadInput(fileInputRef);
  }, [pagination.resetPage]);

  const handleMappingCancel = React.useCallback(() => {
    setMappingOpen(false);
    resetPendingUpload();
    clearUploadInput(fileInputRef);
  }, [resetPendingUpload]);

  const mappingDialogFieldConfigs = React.useMemo(
    () =>
      RECIPIENT_FIELD_MAPPINGS.filter((config) => mappingDialogFields.includes(config.field)),
    [mappingDialogFields],
  );

  const newCustomColumnHeaders = React.useMemo(
    () => getNewCustomColumnHeaders(pendingUploadHeaders, columnMapping),
    [pendingUploadHeaders, columnMapping],
  );

  const handleMappingSubmit = React.useCallback(() => {
    const missingRequired = RECIPIENT_FIELD_MAPPINGS.filter(
      (config) => config.required && columnMapping[config.field] === COLUMN_MAP_UNMAPPED,
    ).map((config) => config.label);

    if (missingRequired.length > 0) {
      toast({
        title: "Mapping required",
        description: `Map required fields: ${missingRequired.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (!pendingUploadFile) {
      handleMappingCancel();
      return;
    }

    const customColumnHeaders = getNewCustomColumnHeaders(
      pendingUploadHeaders,
      columnMapping,
    );
    const parsedRecipients = applyColumnMapping(
      pendingUploadRows,
      columnMapping,
      columnDefaults,
      customColumnHeaders,
    );
    const validationErrors = validateRecipients(parsedRecipients);
    finishRecipientsImport(parsedRecipients, pendingUploadFile, customColumnHeaders);

    if (validationErrors.length > 0) {
      showRecipientsValidationIssues(
        parsedRecipients,
        formatValidationErrorsForToast(validationErrors),
      );
      setMappingOpen(false);
      resetPendingUpload();
      return;
    }

    clearFieldError("recipients");
    setIsGlobalEditing(false);
    setEditSnapshot(null);
    setMappingOpen(false);
    resetPendingUpload();
    toast({
      title: "File mapped",
      description: "Participant columns were mapped successfully.",
    });
  }, [
    columnDefaults,
    columnMapping,
    finishRecipientsImport,
    handleMappingCancel,
    pendingUploadFile,
    pendingUploadHeaders,
    pendingUploadRows,
    resetPendingUpload,
    showRecipientsValidationIssues,
  ]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isCreateFlowLocked) {
      e.target.value = "";
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target?.result, { type: "binary" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<RecipientRow>(sheet, { defval: "" });
      const uploadedHeaders = extractUploadedHeaders(rows, sheet);

      if (uploadedHeaders.length === 0) {
        setFieldErrors((prev) => ({
          ...prev,
          recipients: "No column headers found in the uploaded file.",
        }));
        clearUploadInput(fileInputRef);
        return;
      }

      const hasAtLeastOneDataRow = rows.some((row) =>
        Object.values(row).some((value) => String(value ?? "").trim().length > 0),
      );
      if (!hasAtLeastOneDataRow) {
        setFieldErrors((prev) => ({
          ...prev,
          recipients: "Uploaded Excel is empty. Add at least one participant row.",
        }));
        clearUploadInput(fileInputRef);
        return;
      }

      if (!uploadedHeadersMatchSample(uploadedHeaders)) {
        const needsMapping = getFieldsNeedingMapping(uploadedHeaders);
        const extraHeaders = getUnrecognizedUploadedHeaders(uploadedHeaders);

        if (needsMapping.length === 0 && extraHeaders.length === 0) {
          const imported = importMappedRecipients(
            rows,
            uploadedHeaders,
            file,
            finishRecipientsImport,
            (message) => {
              const mapping = buildInitialColumnMapping(uploadedHeaders);
              const customColumnHeaders = getNewCustomColumnHeaders(uploadedHeaders, mapping);
              const parsedRecipients = applyColumnMapping(rows, mapping, {}, customColumnHeaders);
              showRecipientsValidationIssues(parsedRecipients, message);
            },
          );
          if (!imported) return;
          clearFieldError("recipients");
          setIsGlobalEditing(false);
          setEditSnapshot(null);
          return;
        }

        setPendingUploadRows(rows);
        setPendingUploadFile(file);
        setPendingUploadHeaders(uploadedHeaders);
        setColumnMapping(buildInitialColumnMapping(uploadedHeaders));
        setColumnDefaults({});
        setMappingDialogFields(needsMapping.map((config) => config.field));
        setMappingOpen(true);
        return;
      }

      const initialMapping = buildInitialColumnMapping(uploadedHeaders);
      const extraHeaders = getNewCustomColumnHeaders(uploadedHeaders, initialMapping);
      const parsedRecipients = normalizeWorksheetRows(rows).map((recipient, index) =>
        attachCustomFieldsFromRow(recipient, rows[index] ?? {}, extraHeaders),
      );
      const validationErrors = validateRecipients(parsedRecipients);

      finishRecipientsImport(parsedRecipients, file, extraHeaders);

      if (validationErrors.length > 0) {
        showRecipientsValidationIssues(
          parsedRecipients,
          formatValidationErrorsForToast(validationErrors),
        );
        return;
      }

      clearFieldError("recipients");
      setIsGlobalEditing(false);
      setEditSnapshot(null);
    };

    reader.readAsBinaryString(file);
  };

  const handleRemoveUpload = () => {
    setRecipients([]);
    setIsGlobalEditing(false);
    setEditSnapshot(null);
    clearParticipantUploadState();
  };

  const updateRecipientAt = (index: number, field: keyof CampaignRecipient, value: string) => {
    if (!CORE_RECIPIENT_FIELD_KEYS.has(field)) return;
    const formattedValue = formatRecipientField(field, value);
    clearFieldError("recipients");
    setRecipients((prev) =>
      prev.map((recipient, recipientIndex) =>
        recipientIndex === index ? { ...recipient, [field]: formattedValue } : recipient,
      ),
    );
  };

  const updateRecipientCustomAt = (index: number, column: string, value: string) => {
    clearFieldError("recipients");
    setRecipients((prev) =>
      prev.map((recipient, recipientIndex) => {
        if (recipientIndex !== index) return recipient;
        return {
          ...recipient,
          customFields: {
            ...(recipient.customFields ?? {}),
            [column]: value,
          },
        };
      }),
    );
  };

  const handleToggleGlobalEdit = () => {
    if (isGlobalEditing) {
      const validationErrors = validateRecipients(recipients);
      if (validationErrors.length > 0) {
        setFieldErrors((prev) => ({
          ...prev,
          recipients: formatValidationErrorsForToast(validationErrors),
        }));
        return;
      }
      setRecipients((prev) => prev.map((recipient) => normalizeRecipientFields(recipient)));
      clearFieldError("recipients");
      setEditSnapshot(null);
      setIsGlobalEditing(false);
      return;
    }

    setEditSnapshot(recipients.map((recipient) => ({ ...recipient })));
    setIsGlobalEditing(true);
  };

  const handleCancelGlobalEdit = () => {
    if (editSnapshot) {
      setRecipients(editSnapshot);
    }
    setEditSnapshot(null);
    setIsGlobalEditing(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isGlobalEditing) {
      toast({
        title: "Finish editing participants",
        description: "Click Done on the participants table before saving the campaign.",
        variant: "destructive",
      });
      return;
    }

    const nextFieldErrors = validateCampaignForm(formData, recipients);
    const recipientValidationErrors = validateRecipients(recipients);

    if (recipientValidationErrors.length > 0) {
      nextFieldErrors.recipients =
        recipientValidationErrors.length === 1
          ? withoutRowPrefix(recipientValidationErrors[0])
          : `${withoutRowPrefix(recipientValidationErrors[0])}. (+${recipientValidationErrors.length - 1} more issue${recipientValidationErrors.length > 2 ? "s" : ""})`;
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      if (isEdit) {
        const payload = buildCampaignPayload();
        const res = await customFetch(buildGiftApiUrl(`/campaign/updateCampaign/${campaignId}`), {
          method: "PATCH",
          body: buildCampaignRequestBody(payload, uploadedFile),
        });

        if (!isApiSuccessResponse(res)) {
          toast({
            title: "Error",
            description: getApiResponseMessage(res, "Something went wrong"),
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Success",
          description: getApiResponseMessage(res, "Campaign updated successfully"),
        });
        navigate("/corporate/campaigns");
        return;
      }

      const payload = buildCampaignPayload();

      let paymentRes = await createCampaignRecord(payload, null);
      if (!isCampaignApiSuccess(paymentRes)) {
        toast({
          title: "Error",
          description: getCampaignApiMessage(paymentRes, "Something went wrong"),
          variant: "destructive",
        });
        return;
      }

      let savedCampaignId = unwrapCampaignIdFromResponse(paymentRes);
      let payment = unwrapCampaignPaymentData(paymentRes);

      if (!payment && savedCampaignId) {
        paymentRes = await requestCampaignPaymentOrder(savedCampaignId, payload, null);
        if (!isCampaignApiSuccess(paymentRes)) {
          toast({
            title: "Error",
            description: getCampaignApiMessage(paymentRes, "Could not start payment"),
            variant: "destructive",
          });
          return;
        }
        savedCampaignId = unwrapCampaignIdFromResponse(paymentRes) ?? savedCampaignId;
        payment = unwrapCampaignPaymentData(paymentRes);
      }

      if (!payment) {
        toast({
          title: "Success",
          description: getCampaignApiMessage(paymentRes, "Campaign created successfully"),
        });
        navigate("/corporate/campaigns");
        return;
      }

      const campaignIdForPayment = payment.campaignId ?? savedCampaignId;
      if (!campaignIdForPayment) {
        toast({
          title: "Error",
          description: "Campaign id was not returned for payment",
          variant: "destructive",
        });
        return;
      }

      await openCampaignRazorpayCheckout(
        {
          razorpayKeyId: payment.razorpayKeyId,
          razorpayOrderId: payment.razorpayOrderId,
          amountInPaise: payment.amountInPaise,
          currency: payment.currency,
          campaignName: formData.name.trim(),
        },
        {
          onSuccess: async (razorpayResponse) => {
            try {
              const confirmRes = await confirmCampaignPayment(
                payload,
                campaignIdForPayment,
                razorpayResponse,
                null,
              );

              if (!isCampaignApiSuccess(confirmRes)) {
                toast({
                  title: "Error",
                  description: getCampaignApiMessage(confirmRes, "Could not confirm campaign payment"),
                  variant: "destructive",
                });
                return;
              }

              toast({
                title: "Success",
                description: getCampaignApiMessage(confirmRes, "Campaign created successfully"),
              });
              navigate("/corporate/campaigns");
            } catch (confirmError: unknown) {
              toast({
                title: "Error",
                description:
                  confirmError instanceof Error ? confirmError.message : "Could not confirm payment",
                variant: "destructive",
              });
            }
          },
          onDismiss: () => {
            toast({
              title: "Payment pending",
              description: "Complete payment later to activate this campaign.",
            });
            navigate("/corporate/campaigns");
          },
        },
      );
    } catch (err: unknown) {
      console.error(err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const buildCampaignPayload = () => {
    const finalRecipients = recipients.map((row) => {
      const normalized = normalizeRecipientFields(row);
      return {
        empId: normalized.empId,
        name: normalized.name,
        email: normalized.email,
        mobile: normalized.mobile,
        panNumber: normalized.panNumber,
        amount: parseRecipientAmount(normalized.amount),
        ...(normalized.customFields ?? {}),
      };
    });


    const uploaderName = getUserDisplayName(user, "");
    const uploadMetadata =
      fileName.trim() || uploadedAt || uploaderName
        ? {
          uploadedBy: uploaderName,
          uploadedAt: uploadedAt ?? new Date().toISOString(),
        }
        : {};

    return {
      campaignName: formData.name.trim(),
      assetType: formData.assetType,
      scheduledDate: formData.scheduledDate ? new Date(formData.scheduledDate).toISOString() : null,
      recipients: finalRecipients,
      userId: loggedInUserId || undefined,
      ...uploadMetadata,
    };
  };

  const handleSaveDraft = async () => {
    if (isCreateFlowLocked) return;

    const nextFieldErrors = validateCampaignForm(formData, recipients);

    const validationErrors = validateRecipients(recipients);
    if (validationErrors.length > 0) {
      nextFieldErrors.recipients =
        validationErrors.length === 1
          ? withoutRowPrefix(validationErrors[0])
          : `${withoutRowPrefix(validationErrors[0])}. (+${validationErrors.length - 1} more issue${validationErrors.length > 2 ? "s" : ""})`;
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});
    const payload = buildCampaignPayload();
    setIsSavingDraft(true);
    try {
      const url = isEdit ? `/campaign/updateCampaign/${campaignId}` : `/campaign/createCampaign`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await customFetch(buildGiftApiUrl(url), {
        method,
        body: JSON.stringify(isEdit ? payload : { ...payload, isDraft: true }),
      });

      if (isApiSuccessResponse(res)) {
        toast({
          title: "Success",
          description: getApiResponseMessage(res, "Campaign draft saved successfully"),
        });
        navigate("/corporate/campaigns");
      } else {
        toast({
          title: "Error",
          description: getApiResponseMessage(res, "Failed to save draft"),
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to save draft",
        variant: "destructive",
      });
    } finally {
      setIsSavingDraft(false);
    }
  };
  const handleFieldChange = (field: keyof CampaignRecipient, value: string) => {
    setAddUserFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setNewUser((prev) => ({
      ...prev,
      [field]: formatRecipientField(field, value),
    }));
  };

  const handleCustomFieldChange = (column: string, value: string) => {
    setNewUser((prev) => ({
      ...prev,
      customFields: {
        ...(prev.customFields ?? {}),
        [column]: value,
      },
    }));
  };

  const handleAddUser = () => {
    const normalizedUser = normalizeRecipientFields(newUser);
    const addUserErrors: string[] = [];
    const nextFieldErrors: AddUserFieldErrors = {};

    if (!normalizedUser.empId) {
      addUserErrors.push("Employee Id is required.");
      nextFieldErrors.empId = "Employee Id is required";
    }
    if (!normalizedUser.name) {
      addUserErrors.push("Name is required.");
      nextFieldErrors.name = "Name is required";
    }
    if (!normalizedUser.email) {
      addUserErrors.push("Email is required.");
      nextFieldErrors.email = "Email is required";
    } else if (!isValidRecipientEmail(normalizedUser.email)) {
      addUserErrors.push("Email format is invalid.");
      nextFieldErrors.email = "Enter a valid email address";
    }
    if (!normalizedUser.mobile) {
      addUserErrors.push("Phone Number is required.");
      nextFieldErrors.mobile = "Phone Number is required";
    } else if (isMobileLengthGreaterThanTen(newUser.mobile)) {
      addUserErrors.push("Phone Number must not be greater than 10 digits.");
      nextFieldErrors.mobile = "Phone Number must not be greater than 10 digits";
    } else if (!isValidIndianMobile(normalizedUser.mobile)) {
      addUserErrors.push("Phone Number must be a valid 10-digit Indian mobile number.");
      nextFieldErrors.mobile = "Enter a valid 10-digit Indian mobile number";
    }
    if (!normalizedUser.panNumber) {
      addUserErrors.push("Pan Number is required.");
      nextFieldErrors.panNumber = "Pan Number is required";
    } else if (!isValidPanNumber(normalizedUser.panNumber)) {
      addUserErrors.push("Pan Number must be in format ABCDE1234F.");
      nextFieldErrors.panNumber = "PAN format should be ABCDE1234F";
    }
    if (!normalizedUser.amount) {
      addUserErrors.push("Amount is required.");
      nextFieldErrors.amount = "Amount is required";
    } else if (
      !Number.isFinite(parseRecipientAmount(normalizedUser.amount)) ||
      parseRecipientAmount(normalizedUser.amount) <= 0
    ) {
      addUserErrors.push("Amount must be a valid number greater than 0.");
      nextFieldErrors.amount = "Enter an amount greater than 0";
    }

    if (addUserErrors.length > 0) {
      setAddUserFieldErrors(nextFieldErrors);
      return;
    }

    const duplicateErrors = validateRecipients([...recipients, normalizedUser]).filter((message) =>
      String(message).toLowerCase().includes("is duplicated"),
    );
    if (duplicateErrors.length > 0) {
      setFieldErrors((prev) => ({
        ...prev,
        recipients: formatValidationErrorsForToast(duplicateErrors),
      }));
      setAddOpen(false);
      return;
    }

    setAddUserFieldErrors({});
    clearFieldError("recipients");
    setRecipients((prev) => [...prev, normalizedUser]);
    setAddOpen(false);
    setNewUser({
      empId: "",
      name: "",
      email: "",
      mobile: "",
      panNumber: "",
      amount: "",
      customFields: buildEmptyCustomFields(),
    });
  };
  const confirmDeleteUser = () => {
    if (selectedUserIndex === null) return;
    const nextRecipients = recipients.filter((_, index) => index !== selectedUserIndex);
    setRecipients(nextRecipients);
    if (editSnapshot) {
      setEditSnapshot((prev) =>
        prev ? prev.filter((_, index) => index !== selectedUserIndex) : prev,
      );
    }
    if (nextRecipients.length === 0) {
      setIsGlobalEditing(false);
      setEditSnapshot(null);
      clearParticipantUploadState();
    }
    toast({
      title: "Deleted",
      description: "Participant removed from list",
    });
    setDeleteUserOpen(false);
    setSelectedUserIndex(null);
  };

  return (
    <Layout title={isEdit ? "Update Campaign" : "Create Campaign"}>
      <div className="mx-auto max-w-4x4">
        <div className="mb-6">
          <Link
            href="/corporate/campaigns"
            className="mb-4 inline-flex items-center text-sm text-primary hover:underline"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
          <h2 className="text-2xl font-bold text-foreground">{isEdit ? "Edit Campaign" : "Create New Campaign"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Setup campaign details and upload participants
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <form onSubmit={handleCreate} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="mb-1 block text-sm font-medium text-foreground">Campaign Name</label>
                <Input
                  name="name"
                  value={formData.name}
                  placeholder="Enter campaign name"
                  aria-invalid={Boolean(fieldErrors.name)}
                  className={cn(fieldErrors.name && "border-destructive")}
                  onChange={(e) => {
                    clearFieldError("name");
                    setFormData({ ...formData, name: e.target.value });
                  }}
                />
                <FieldError message={fieldErrors.name} />
              </div>

              <div className="space-y-2">
                <label className="mb-1 block text-sm font-medium text-foreground">Asset Type</label>
                <Select
                  value={formData.assetType || undefined}
                  onValueChange={(value) => {
                    clearFieldError("assetType");
                    setFormData({ ...formData, assetType: value });
                  }}
                >
                  <SelectTrigger
                    aria-invalid={Boolean(fieldErrors.assetType)}
                    className={cn(
                      "h-11 w-full rounded-xl border-border bg-background",
                      fieldErrors.assetType && "border-destructive",
                    )}
                  >
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GOLD">Digital Gold</SelectItem>
                    <SelectItem value="SILVER">Digital Silver</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.assetType} />
              </div>

              <div className="space-y-2">
                <label className="mb-1 block text-sm font-medium text-foreground">Scheduled Date</label>
                <Popover
                  open={scheduledDatePopoverOpen}
                  onOpenChange={setScheduledDatePopoverOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      aria-invalid={Boolean(fieldErrors.scheduledDate)}
                      className={cn(
                        "h-11 w-full cursor-pointer justify-between gap-2 rounded-xl border-border bg-background px-3 text-left text-sm font-normal shadow-none hover:bg-muted",
                        fieldErrors.scheduledDate && "border-destructive",
                      )}
                      aria-label={
                        formData.scheduledDate
                          ? `Scheduled date ${formatScheduledDateLabel(formData.scheduledDate)}`
                          : "Select scheduled date"
                      }
                    >
                      <span
                        className={
                          formData.scheduledDate
                            ? "truncate text-foreground"
                            : "truncate text-muted-foreground"
                        }
                      >
                        {formatScheduledDateLabel(formData.scheduledDate)}
                      </span>
                      <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-auto max-w-[calc(100vw-2rem)] rounded-xl border border-border p-0 shadow-md"
                    sideOffset={6}
                  >
                    <Calendar
                      mode="single"
                      selected={parseScheduledDate(formData.scheduledDate)}
                      onSelect={(date) => {
                        clearFieldError("scheduledDate");
                        setFormData((current) => ({
                          ...current,
                          scheduledDate: date ? toScheduledDateValue(date) : "",
                        }));
                        if (date) setScheduledDatePopoverOpen(false);
                      }}
                      className="rounded-xl p-1 [--cell-size:1rem]"
                      classNames={{
                        month: "flex min-w-[17.5rem] flex-col gap-4",
                        table: "w-full border-collapse",
                        weekdays: "flex w-full",
                        week: "mt-2 flex w-full",
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <FieldError message={fieldErrors.scheduledDate} />
              </div>

              <div className="space-y-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-foreground">
                    Upload Participants (CSV / Excel)
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto cursor-pointer p-0 hover:text-primary/80"
                    onClick={downloadSampleRecipientExcel}
                    disabled={isCreateFlowLocked}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    Sample Excel
                  </Button>
                </div>
                <div
                  className={
                    isCreateFlowLocked ? "pointer-events-none relative opacity-60" : "relative"
                  }
                >
                  <Upload className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    onChange={handleFileUpload}
                    aria-invalid={Boolean(fieldErrors.recipients)}
                    className={cn(
                      "pl-9 file:ml-2 disabled:cursor-not-allowed disabled:opacity-60",                
                    )}
                    disabled={isCreateFlowLocked}
                  />
                </div>

              </div>
            </div>

            {!isEdit && recipients.length > 0 && fileName ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <p>Uploaded: {fileName}</p>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleRemoveUpload}
                        className="h-7 w-7 cursor-pointer text-red-500 hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove uploaded file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8} className={ACTION_TOOLTIP_CLASS}>
                      Remove Uploaded File
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : null}

            {showRecipientsTable ? (
              <Card className="overflow-hidden">
                <div className="border-b  border-border px-4 py-4 sm:px-6 flex items-center justify-between">
                  <div >
                    <h3 className="text-base font-semibold text-foreground">{isEdit ? "Participants List" : "Uploaded participants preview"}</h3>

                  </div>
                  <TooltipProvider delayDuration={200}>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex cursor-pointer items-center gap-1 transition-all duration-200"
                              disabled={isGlobalEditing}
                              onClick={() => {
                                setAddUserFieldErrors({});
                                setNewUser({
                                  empId: "",
                                  name: "",
                                  email: "",
                                  mobile: "",
                                  panNumber: "",
                                  amount: "",
                                  customFields: buildEmptyCustomFields(),
                                });
                                setAddOpen(true);
                              }}
                              aria-label="Add participant"
                            >
                              <AddIcon fontSize="small" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          sideOffset={8}
                          className={ACTION_TOOLTIP_CLASS}
                        >
                          Add Participant
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
                            <Button
                              type="button"
                              variant={isGlobalEditing ? "default" : "outline"}
                              size="sm"
                              className="flex cursor-pointer items-center gap-1 transition-all duration-200"
                              onClick={handleToggleGlobalEdit}
                              aria-label={
                                isGlobalEditing ? "Finish editing participants" : "Edit participants"
                              }
                            >
                              {isGlobalEditing ? (
                                "Save"
                              ) : (
                                <>
                                  <Pencil className="h-4 w-4" />
                                  <span className="sr-only">Edit</span>
                                </>
                              )}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          sideOffset={8}
                          className={ACTION_TOOLTIP_CLASS}
                        >
                          {isGlobalEditing ? "Save Participant Edits" : "Edit Participants"}
                        </TooltipContent>
                      </Tooltip>
                      {isGlobalEditing ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelGlobalEdit}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </TooltipProvider>
                </div>
                {recipients.length > 0 ? (
                  <div className="border-b border-border px-4 py-3 sm:px-6">
                    <div className="relative max-w-md">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={recipientSearchTerm}
                        onChange={(event) => setRecipientSearchTerm(event.target.value)}
                        placeholder="Search participants…"
                        className="pl-10"
                        aria-label="Search participants"
                        disabled={isGlobalEditing}
                      />
                    </div>
                  </div>
                ) : null}
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        {previewColumns.map((column) => (
                          <TableHead
                            key={column}
                            className="whitespace-nowrap px-4 py-3 font-medium text-foreground uppercase"
                          >
                            {column}
                          </TableHead>
                        ))}
                        <TableHead className="whitespace-nowrap px-4 py-3 font-medium text-foreground uppercase">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {isLoadingCampaign ? (
                        <TableRow>
                          <TableCell
                            colSpan={previewColumns.length + 1}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            Loading participants...
                          </TableCell>
                        </TableRow>
                      ) : recipients.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={previewColumns.length + 1}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            {isEdit
                              ? "No participants found for this campaign."
                              : "Upload an Excel file to preview participants."}
                          </TableCell>
                        </TableRow>
                      ) : filteredRecipientEntries.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={previewColumns.length + 1}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            No participants match your search.
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {!isLoadingCampaign &&
                        pagination.pagedItems.map(({ recipient, index: globalIndex }) => {
                          const rowFieldErrors = recipientFieldErrors[globalIndex] ?? {};
                          return (
                            <TableRow key={`participant-row-${globalIndex}`}>
                              {previewColumns.map((column) => {
                                const columnField = RECIPIENT_COLUMN_FIELDS.find(
                                  (entry) => entry.column === column,
                                )?.field;

                                if (columnField) {
                                  const cellError = rowFieldErrors[columnField];
                                  return (
                                    <TableCell key={column} className="px-4 py-3 text-foreground">
                                      {isGlobalEditing ? (
                                        <div className="space-y-1">
                                          <Input
                                            value={recipient[columnField]}
                                            onChange={(event) =>
                                              updateRecipientAt(
                                                globalIndex,
                                                columnField,
                                                event.target.value,
                                              )
                                            }
                                            className={cn("h-9 min-w-[120px]", cellError && "border-destructive")}
                                            type={columnField === "amount" ? "number" : "text"}
                                            inputMode={
                                              columnField === "mobile"
                                                ? "numeric"
                                                : columnField === "panNumber"
                                                  ? "text"
                                                  : undefined
                                            }
                                            maxLength={
                                              columnField === "mobile"
                                                ? 10
                                                : columnField === "panNumber"
                                                  ? 10
                                                  : undefined
                                            }
                                            placeholder={
                                              columnField === "mobile"
                                                ? "9876543210"
                                                : columnField === "panNumber"
                                                  ? "ABCDE1234F"
                                                  : undefined
                                            }
                                          />
                                          {cellError ? (
                                            <p className="text-xs text-destructive">{cellError}</p>
                                          ) : null}
                                        </div>
                                      ) : (
                                        String(recipient[columnField] || "-")
                                      )}
                                    </TableCell>
                                  );
                                }

                                const customValue = recipient.customFields?.[column] ?? "";
                                return (
                                  <TableCell key={column} className="px-4 py-3 text-foreground">
                                    {isGlobalEditing ? (
                                      <Input
                                        value={customValue}
                                        onChange={(event) =>
                                          updateRecipientCustomAt(
                                            globalIndex,
                                            column,
                                            event.target.value,
                                          )
                                        }
                                        className="h-9 min-w-[120px]"
                                      />
                                    ) : (
                                      String(customValue || "-")
                                    )}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="px-4 py-3">
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="cursor-pointer text-red-400 hover:text-red-500"
                                        onClick={() => {
                                          setSelectedUserIndex(globalIndex);
                                          setDeleteUserOpen(true);
                                        }}
                                        aria-label="Delete participant"
                                      >
                                        <Trash2 className="h-5 w-5" color="#E23D28" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" sideOffset={8} className={ACTION_TOOLTIP_CLASS}>
                                      Delete Participant
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>

                <TablePaginationFooter
                  {...bindTablePaginationFooter(pagination)}
                  pageSizeOptions={PREVIEW_TABLE_PAGE_SIZE_OPTIONS}
                  className="border-border px-4 sm:px-6"
                  summary={
                    <>
                      Showing {pagination.totalItems === 0 ? 0 : pagination.startIndex + 1} to{" "}
                      {Math.min(pagination.startIndex + pagination.pageSize, pagination.totalItems)} of{" "}
                      {pagination.totalItems}
                      {recipientSearchTerm.trim() ? ` (filtered from ${recipients.length})` : ""} entries
                    </>
                  }
                />
              </Card>
            ) : null}

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={() => navigate("/corporate/campaigns")}
              >
                Cancel
              </Button>
              {!isCreateFlowLocked ? (
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => void handleSaveDraft()}
                  disabled={isSavingDraft || recipients.length === 0}
                >
                  {isSavingDraft ? "Saving..." : "Save as Draft"}
                </Button>
              ) : null}

              <Button
                type="submit"
                className="cursor-pointer"
                disabled={
                  isSubmitting ||
                  isSavingDraft ||
                  isGlobalEditing ||
                  (!isEdit && recipients.length === 0)
                }
              >
                {isSubmitting ? "Processing..." : isEdit ? "Save" : "Create Campaign"}
              </Button>
            </div>
          </form>
        </div>
      </div>
      <Dialog
        open={mappingOpen}
        onOpenChange={(open) => {
          if (!open) handleMappingCancel();
          else setMappingOpen(true);
        }}
      >
        <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 sm:rounded-xl">
          <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <DialogTitle className="text-base font-semibold text-primary-foreground">Mapping</DialogTitle>
            <p className="sr-only">Map uploaded file columns to participant fields</p>
          </div>

          <div className="grid grid-cols-[1.1fr_1.4fr] gap-3 border-b border-border bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>System fields</span>
            <span>Column in uploaded file</span>
          </div>

          <div className="max-h-[min(24rem,55vh)] overflow-y-auto px-4 py-3">
            {mappingDialogFieldConfigs.length === 0 && newCustomColumnHeaders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                All participant fields matched the sample.
              </p>
            ) : null}

            {mappingDialogFieldConfigs.map((config) => (
              <div
                key={config.field}
                className="grid grid-cols-[1.1fr_1.4fr] items-center gap-3 border-b border-border py-3 last:border-0"
              >
                <div className="text-sm font-medium text-foreground">
                  {config.label}
                  {config.required ? <span className="text-destructive"> *</span> : null}
                </div>
                <Select
                  value={columnMapping[config.field] ?? COLUMN_MAP_UNMAPPED}
                  onValueChange={(value) =>
                    setColumnMapping((current) => ({ ...current, [config.field]: value }))
                  }
                >
                  <SelectTrigger className="h-10 w-full rounded-lg border-border bg-background">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={COLUMN_MAP_UNMAPPED}>— Select column —</SelectItem>
                    {pendingUploadHeaders.map((header) => (
                      <SelectItem key={header} value={header}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            {newCustomColumnHeaders.length > 0 ? (
              <>
                {mappingDialogFieldConfigs.length > 0 ? (
                  <p className="pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    New columns
                  </p>
                ) : null}
                {newCustomColumnHeaders.map((header) => (
                  <div
                    key={header}
                    className="grid grid-cols-[1.1fr_1.4fr] items-center gap-3 border-b border-border py-3 last:border-0"
                  >
                    <div className="text-sm font-medium text-foreground">{header}</div>
                    <p className="text-sm text-muted-foreground">Will be added as a new column</p>
                  </div>
                ))}
              </>
            ) : null}
          </div>

          <DialogFooter className="gap-2 border-t border-border px-4 py-4 sm:justify-start">
            <Button type="button" onClick={handleMappingSubmit}>
              Submit
            </Button>
            <Button type="button" variant="outline" onClick={handleMappingCancel}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {(
              [
                ["empId", "Employee Id", true],
                ["name", "Name", true],
                ["email", "Email", true],
                ["mobile", "Phone Number", true],
                ["panNumber", "Pan Number", true],
                ["amount", "Amount", true],
              ] as const
            ).map(([field, label, required]) => (
              <div key={field} className="space-y-1.5">
                <label className="text-sm font-medium">
                  {label}
                  {required ? " *" : ""}
                </label>
                <Input
                  value={newUser[field]}
                  onChange={(e) => handleFieldChange(field, e.target.value)}
                  placeholder={
                    field === "mobile"
                      ? "9876543210"
                      : field === "panNumber"
                        ? "ABCDE1234F"
                        : `Enter ${label.toLowerCase()}`
                  }
                  type={field === "amount" ? "number" : "text"}
                  inputMode={field === "mobile" ? "numeric" : field === "panNumber" ? "text" : undefined}
                  maxLength={field === "mobile" ? 10 : field === "panNumber" ? 10 : undefined}
                  aria-invalid={Boolean(addUserFieldErrors[field])}
                  className={cn(addUserFieldErrors[field] && "border-destructive")}
                />
                {addUserFieldErrors[field] ? (
                  <p className="mt-1 text-xs text-destructive">{addUserFieldErrors[field]}</p>
                ) : null}
              </div>
            ))}
            {customColumns.map((column) => (
              <div key={column} className="space-y-1.5">
                <label className="text-sm font-medium">{column}</label>
                <Input
                  value={newUser.customFields?.[column] ?? ""}
                  onChange={(e) => handleCustomFieldChange(column, e.target.value)}
                  placeholder={`Enter ${column.toLowerCase()}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline"
              onClick={() => {
                setAddUserFieldErrors({});
                setAddOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleAddUser}>
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteUserOpen}
        onOpenChange={(open) => {
          setDeleteUserOpen(open);
          if (!open) {
            setSelectedUserIndex(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Participant</DialogTitle>
            <DialogDescription>
              {selectedUserIndex !== null && recipients[selectedUserIndex]?.name
                ? `Are you sure you want to remove ${recipients[selectedUserIndex].name} from this campaign?`
                : "Are you sure you want to remove this participant from the campaign?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteUserOpen(false);
                setSelectedUserIndex(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteUser}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
