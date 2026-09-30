import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

type ExcelColumn = {
  header: string;
  key: string;
  width?: number;
};

type ExportExcelOptions = {
  fileName: string;
  sheetName: string;
  columns: ExcelColumn[];
  rows: Record<string, any>[];
};

type BulkPaymentExcelRow = {
  beneficiaryName?: string;
  beneficiaryAccountNumber?: string;
  ifsc?: string;
  transactionType?: string;
  debitAccountNumber?: string;
  transactionDate?: string;
  amount?: number | null;
  currency?: string;
  beneficiaryEmailId?: string;
  remarks?: string;
  customHeader1?: string;
  customHeader2?: string;
  customHeader3?: string;
  customHeader4?: string;
  customHeader5?: string;
};

export async function exportToExcel({
  fileName,
  sheetName,
  columns,
  rows,
}: ExportExcelOptions) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = columns;

  rows.forEach((row) => {
    worksheet.addRow(row);
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.eachCell((cell) => {
        cell.alignment = {
          horizontal: "left",
          vertical: "middle",
        };
      });
    }
  });

  const headerRow = worksheet.getRow(1);

  headerRow.font = {
    bold: true,
    size: 12,
  };

  headerRow.alignment = {
    vertical: "middle",
    horizontal: "left",
  };

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  worksheet.views = [
    {
      state: "frozen",
      ySplit: 1,
    },
  ];

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  saveAs(blob, fileName);
}

const BULK_PAYMENT_HEADERS = [
  "Beneficiary Name",
  "Beneficiary Account Number",
  "IFSC",
  "Transaction Type",
  "Debit Account Number",
  "Transaction Date",
  "Amount",
  "Currency",
  "Beneficiary Email ID",
  "Remarks",
  "Custom Header \u2013 1",
  "Custom Header \u2013 2",
  "Custom Header \u2013 3",
  "Custom Header \u2013 4",
  "Custom Header \u2013 5",
];

const BULK_PAYMENT_INSTRUCTIONS = [
  "Enter beneficiary name.\nMANDATORY",
  "Enter beneficiary account number. \nThis can be IDFC FIRST Bank account or other Bank account.\nMANDATORY",
  "Enter beneficiary bank IFSC code. Required only for Inter bank (NEFT/RTGS) payment.",
  "Enter payment type:\nIFT - Within Bank payment\nNEFT - Inter-Bank(NEFT) payment\nRTGS - Inter-Bank(RTGS) payment\nMANDATORY",
  "Enter debit account number. This should be IDFC FIRST Bank account only. User should have access to do transaction on this account",
  "Enter transaction value date. Should be today's date or future date.\nMANDATORY\nDD/MM/YYYY format",
  "Enter payment amount.\nMANDATORY",
  "Enter transaction currency. Should be INR only.\nMANDATORY",
  "Enter beneficiary email id\nOPTIONAL",
  "Enter remarks\nOPTIONAL",
  "Credit Advice:\nEnter Custom Info -1\nNote: Header label is editable in Row 1\nOPTIONAL",
  "Credit Advice:\nEnter Custom Info -2\nNote: Header label is editable in Row 1\nOPTIONAL",
  "Credit Advice:\nEnter Custom Info -3\nNote: Header label is editable in Row 1\nOPTIONAL",
  "Credit Advice:\nEnter Custom Info -4\nNote: Header label is editable in Row 1\nOPTIONAL",
  "Credit Advice:\nEnter Custom Info -5\nNote: Header label is editable in Row 1\nOPTIONAL",
];

const BULK_PAYMENT_COLUMN_WIDTHS = [
  22.6640625,
  25.77734375,
  21.33203125,
  18.109375,
  18.6640625,
  15.77734375,
  13.109375,
  14.109375,
  28,
  23.44140625,
  23.44140625,
  23.44140625,
  23.44140625,
  23.44140625,
  23.44140625,
];

export async function exportBulkPaymentExcel({
  fileName,
  rows,
}: {
  fileName: string;
  rows: BulkPaymentExcelRow[];
}) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");
  const textColumns = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15];
  const defaultFont = {
    size: 11,
    color: { theme: 1 },
    name: "Calibri",
    family: 2,
    scheme: "minor" as const,
  };
  const headerFont = {
    size: 10,
    color: { theme: 1 },
    name: "Calibri",
    family: 2,
    scheme: "minor" as const,
  };
  const headerFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { theme: 8, tint: 0.5999938962981048 },
    bgColor: { indexed: 64 },
  };
  const instructionFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { theme: 8, tint: 0.7999816888943144 },
    bgColor: { indexed: 64 },
  };
  const thinBorder = {
    top: { style: "thin" as const, color: { indexed: 64 } },
    left: { style: "thin" as const, color: { indexed: 64 } },
    bottom: { style: "thin" as const, color: { indexed: 64 } },
    right: { style: "thin" as const, color: { indexed: 64 } },
  };
  const customHeaderBorder = {
    top: { style: "medium" as const, color: { indexed: 64 } },
    left: { style: "medium" as const, color: { indexed: 64 } },
    bottom: { style: "thin" as const, color: { indexed: 64 } },
    right: { style: "thin" as const, color: { indexed: 64 } },
  };

  BULK_PAYMENT_COLUMN_WIDTHS.forEach((width, index) => {
    const column = worksheet.getColumn(index + 1);
    column.width = width;
    column.numFmt = index === 6 ? "0.00" : "@";
  });

  worksheet.addRow(BULK_PAYMENT_HEADERS);
  worksheet.addRow(BULK_PAYMENT_INSTRUCTIONS);

  rows.forEach((row) => {
    worksheet.addRow([
      row.beneficiaryName ?? "",
      row.beneficiaryAccountNumber ?? "",
      row.ifsc ?? "",
      row.transactionType ?? "NEFT",
      row.debitAccountNumber ?? "",
      row.transactionDate ?? "",
      row.amount ?? null,
      row.currency ?? "INR",
      row.beneficiaryEmailId ?? "",
      row.remarks ?? "",
      row.customHeader1 ?? "",
      row.customHeader2 ?? "",
      row.customHeader3 ?? "",
      row.customHeader4 ?? "",
      row.customHeader5 ?? "",
    ]);
  });

  const headerRow = worksheet.getRow(1);
  headerRow.height = 38.25;
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.border = colNumber >= 11 ? customHeaderBorder : thinBorder;
    cell.alignment =
      colNumber >= 11
        ? { horizontal: "center", wrapText: true }
        : { horizontal: "center" };
    if (colNumber >= 11) {
      cell.protection = { locked: false, hidden: false };
    }
  });

  const instructionRow = worksheet.getRow(2);
  instructionRow.height = 110.4;
  instructionRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { ...headerFont, italic: true };
    cell.fill = instructionFill;
    cell.border = thinBorder;
    cell.alignment = { horizontal: "center", wrapText: true };
  });

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (rowNumber >= 3) {
        cell.font = defaultFont;
        cell.fill = { type: "pattern", pattern: "none" };
        cell.border = {};
        cell.protection = { locked: false, hidden: colNumber === 7 };
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
      if (textColumns.includes(colNumber)) {
        cell.numFmt = "@";
      }
    });
  });

  worksheet.views = [{ state: "frozen", ySplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  saveAs(blob, fileName);
}
