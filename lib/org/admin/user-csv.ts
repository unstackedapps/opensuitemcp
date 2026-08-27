import type { OrgRole } from "@/lib/db/schema";

export type UserProvisionAction = "upsert" | "delete";

export type UserProvisionRow = {
  line: number;
  email: string;
  name: string | null;
  role: OrgRole;
  disabled: boolean;
  action: UserProvisionAction;
};

export type UserCsvParseResult = {
  rows: UserProvisionRow[];
  errors: string[];
};

const CSV_HEADERS = ["email", "name", "role", "disabled", "action"] as const;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseDisabled(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "false") {
    return false;
  }
  if (normalized === "true") {
    return true;
  }
  return null;
}

function parseRole(value: string): OrgRole | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "owner" ||
    normalized === "admin" ||
    normalized === "member"
  ) {
    return normalized;
  }
  return null;
}

function parseAction(value: string): UserProvisionAction | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "upsert") {
    return "upsert";
  }
  if (normalized === "delete") {
    return "delete";
  }
  return null;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export function parseUserProvisionCsv(text: string): UserCsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const errors: string[] = [];
  const rows: UserProvisionRow[] = [];

  if (lines.length === 0) {
    return { rows, errors: ["CSV is empty."] };
  }

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader);
  const headerIndex = new Map<string, number>();
  for (const [index, header] of headerCells.entries()) {
    headerIndex.set(header, index);
  }

  if (!headerIndex.has("email")) {
    return { rows, errors: ["CSV must include an email column."] };
  }

  const dataLines =
    headerIndex.has("email") && lines.length > 1 ? lines.slice(1) : lines;

  for (let lineIndex = 0; lineIndex < dataLines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 2;
    const cells = parseCsvLine(dataLines[lineIndex]);
    const getCell = (key: string): string => {
      const index = headerIndex.get(key);
      if (index === undefined) {
        return "";
      }
      return cells[index] ?? "";
    };

    const email = getCell("email").trim().toLowerCase();
    if (!email) {
      errors.push(`Line ${lineNumber}: email is required.`);
      continue;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Line ${lineNumber}: invalid email "${email}".`);
      continue;
    }

    const action = parseAction(getCell("action"));
    if (!action) {
      errors.push(`Line ${lineNumber}: action must be upsert or delete.`);
      continue;
    }

    if (action === "delete") {
      rows.push({
        line: lineNumber,
        email,
        name: null,
        role: "member",
        disabled: false,
        action,
      });
      continue;
    }

    const role = parseRole(getCell("role") || "member");
    if (!role) {
      errors.push(`Line ${lineNumber}: invalid role.`);
      continue;
    }

    const nameRaw = getCell("name").trim();
    const disabled = parseDisabled(getCell("disabled"));
    if (disabled === null) {
      errors.push(`Line ${lineNumber}: disabled must be true or false.`);
      continue;
    }

    rows.push({
      line: lineNumber,
      email,
      name: nameRaw || null,
      role,
      disabled,
      action,
    });
  }

  return { rows, errors };
}

export function userProvisionRowsToCsv(
  rows: Array<{
    email: string;
    name: string | null;
    role: OrgRole;
    status: "active" | "disabled";
  }>,
): string {
  const header = CSV_HEADERS.join(",");
  const body = rows.map((row) => {
    const name = row.name ? `"${row.name.replace(/"/g, '""')}"` : "";
    const disabled = row.status === "disabled" ? "true" : "false";
    return [row.email, name, row.role, disabled, "upsert"].join(",");
  });
  return [header, ...body].join("\n");
}

/** Header row plus an example row for import templates. */
export function userProvisionCsvTemplate(): string {
  const header = CSV_HEADERS.join(",");
  const example = [
    "user@example.com",
    "Jane Doe",
    "member",
    "false",
    "upsert",
  ].join(",");
  return [header, example].join("\n");
}
