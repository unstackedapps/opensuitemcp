const SQL_START = /^\s*(WITH|SELECT|INSERT|UPDATE|DELETE)\b/i;
const SQL_CLAUSE = /\b(FROM|WHERE|JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|UNION)\b/i;
const IDENT_CHAR = /[A-Za-z0-9_$.]/;
const TWO_CHAR_OPERATORS = new Set(["<=", ">=", "<>", "!="]);
const NO_SPACE_BEFORE = new Set([",", ")", "."]);
const NO_SPACE_AFTER = new Set(["(", "."]);
const OPERATORS = new Set([
  "=",
  "<",
  ">",
  "<=",
  ">=",
  "<>",
  "!=",
  "+",
  "-",
  "*",
  "/",
]);

const CLAUSE_KEYWORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "HAVING",
  "WITH",
  "UNION",
  "INTERSECT",
  "EXCEPT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "SET",
  "VALUES",
]);

type SqlToken = {
  kind: "string" | "ident" | "punct";
  value: string;
};

function readQuotedString(sql: string, start: number): number {
  const quote = sql[start];
  let index = start + 1;
  while (index < sql.length) {
    const ch = sql[index];
    if (ch !== quote) {
      index += 1;
      continue;
    }
    if (sql[index + 1] === quote) {
      index += 2;
      continue;
    }
    return index + 1;
  }
  return sql.length;
}

function readIdent(sql: string, start: number): number {
  let index = start + 1;
  while (index < sql.length && IDENT_CHAR.test(sql[index] ?? "")) {
    index += 1;
  }
  return index;
}

function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  const text = sql.trim();

  while (index < text.length) {
    const ch = text[index];
    if (ch === undefined) {
      break;
    }
    if (/\s/.test(ch)) {
      index += 1;
    } else if (ch === "'" || ch === '"') {
      const end = readQuotedString(text, index);
      tokens.push({ kind: "string", value: text.slice(index, end) });
      index = end;
    } else if (TWO_CHAR_OPERATORS.has(text.slice(index, index + 2))) {
      tokens.push({ kind: "punct", value: text.slice(index, index + 2) });
      index += 2;
    } else if (!IDENT_CHAR.test(ch)) {
      tokens.push({ kind: "punct", value: ch });
      index += 1;
    } else {
      const end = readIdent(text, index);
      tokens.push({ kind: "ident", value: text.slice(index, end) });
      index = end;
    }
  }

  return tokens;
}

function readKeyword(
  tokens: SqlToken[],
  index: number,
): { text: string; consume: number } | undefined {
  const first = tokens[index];
  if (!first || first.kind !== "ident") {
    return undefined;
  }
  const a = first.value.toUpperCase();
  const b =
    tokens[index + 1]?.kind === "ident"
      ? tokens[index + 1].value.toUpperCase()
      : "";
  const c =
    tokens[index + 2]?.kind === "ident"
      ? tokens[index + 2].value.toUpperCase()
      : "";

  if (a === "GROUP" && b === "BY") {
    return { text: `${first.value} ${tokens[index + 1]?.value}`, consume: 2 };
  }
  if (a === "ORDER" && b === "BY") {
    return { text: `${first.value} ${tokens[index + 1]?.value}`, consume: 2 };
  }
  if (a === "UNION" && b === "ALL") {
    return { text: `${first.value} ${tokens[index + 1]?.value}`, consume: 2 };
  }
  if (a === "LEFT" && b === "OUTER" && c === "JOIN") {
    return {
      text: `${first.value} ${tokens[index + 1]?.value} ${tokens[index + 2]?.value}`,
      consume: 3,
    };
  }
  if (a === "RIGHT" && b === "OUTER" && c === "JOIN") {
    return {
      text: `${first.value} ${tokens[index + 1]?.value} ${tokens[index + 2]?.value}`,
      consume: 3,
    };
  }
  if (a === "LEFT" && b === "JOIN") {
    return { text: `${first.value} ${tokens[index + 1]?.value}`, consume: 2 };
  }
  if (a === "RIGHT" && b === "JOIN") {
    return { text: `${first.value} ${tokens[index + 1]?.value}`, consume: 2 };
  }
  if (a === "INNER" && b === "JOIN") {
    return { text: `${first.value} ${tokens[index + 1]?.value}`, consume: 2 };
  }
  if (a === "CROSS" && b === "JOIN") {
    return { text: `${first.value} ${tokens[index + 1]?.value}`, consume: 2 };
  }
  if (
    CLAUSE_KEYWORDS.has(a) ||
    a === "JOIN" ||
    a === "ON" ||
    a === "AND" ||
    a === "OR"
  ) {
    return { text: first.value, consume: 1 };
  }
  return undefined;
}

function needsSpace(previous: SqlToken | undefined, next: SqlToken): boolean {
  if (!previous) {
    return false;
  }
  if (NO_SPACE_BEFORE.has(next.value) || NO_SPACE_AFTER.has(previous.value)) {
    return false;
  }
  if (
    next.value === "(" &&
    previous.kind === "ident" &&
    !CLAUSE_KEYWORDS.has(previous.value.toUpperCase())
  ) {
    return false;
  }
  if (OPERATORS.has(previous.value) || OPERATORS.has(next.value)) {
    return true;
  }
  return true;
}

export function looksLikeSql(text: string): boolean {
  const trimmed = text.trim();
  if (!SQL_START.test(trimmed)) {
    return false;
  }
  return SQL_CLAUSE.test(trimmed);
}

export function prettyPrintSql(sql: string): string {
  const tokens = tokenizeSql(sql);
  if (tokens.length === 0) {
    return sql.trim();
  }

  const chunks: string[] = [];
  let index = 0;
  let paren = 0;
  let inSelectList = false;
  let selectDepth = 0;
  let previous: SqlToken | undefined;
  let atLineStart = true;
  const blockParens = new Set<number>();

  const writeNewline = (extraIndent: number) => {
    chunks.push(`\n${"  ".repeat(paren + extraIndent)}`);
    atLineStart = true;
    if (paren > 0) {
      blockParens.add(paren);
    }
  };

  const writeText = (text: string, token: SqlToken, spaceBefore: boolean) => {
    if (!atLineStart && spaceBefore) {
      chunks.push(" ");
    }
    chunks.push(text);
    previous = token;
    atLineStart = false;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) {
      break;
    }

    const keyword = readKeyword(tokens, index);
    if (keyword) {
      const name = keyword.text.toUpperCase();
      const keywordToken: SqlToken = { kind: "ident", value: keyword.text };
      if (name === "SELECT") {
        if (chunks.length > 0) {
          writeNewline(0);
        }
        writeText(keyword.text, keywordToken, false);
        inSelectList = true;
        selectDepth = paren;
        writeNewline(1);
      } else if (name === "AND" || name === "OR") {
        writeNewline(1);
        writeText(keyword.text, keywordToken, false);
      } else if (name === "ON") {
        writeNewline(1);
        writeText(keyword.text, keywordToken, false);
      } else {
        inSelectList = false;
        if (chunks.length > 0) {
          writeNewline(0);
        }
        writeText(keyword.text, keywordToken, false);
      }
      index += keyword.consume;
    } else if (token.value === "," && inSelectList && paren === selectDepth) {
      chunks.push(",");
      previous = token;
      writeNewline(1);
      index += 1;
    } else if (token.value === "(") {
      writeText("(", token, needsSpace(previous, token));
      paren += 1;
      blockParens.delete(paren);
      index += 1;
    } else if (token.value === ")") {
      const closeBlock = blockParens.has(paren);
      blockParens.delete(paren);
      paren = Math.max(paren - 1, 0);
      if (closeBlock) {
        writeNewline(0);
      }
      writeText(")", token, false);
      index += 1;
    } else {
      writeText(token.value, token, needsSpace(previous, token));
      index += 1;
    }
  }

  return chunks.join("").trim();
}
