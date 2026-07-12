/**
 * Tiny safe arithmetic-expression evaluator for custom rate formulas.
 * Supports: numbers, variables (qty, rate, days), + - * / ( ),
 * unary minus, and functions min/max/round/ceil/floor/abs.
 * No eval, no property access — safe to run on tenant-provided input.
 */

const FUNCS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  round: Math.round,
  ceil: Math.ceil,
  floor: Math.floor,
  abs: Math.abs,
};

type Token =
  | { kind: "num"; value: number }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const value = Number(src.slice(i, j));
      if (Number.isNaN(value)) throw new Error(`invalid number at ${i}`);
      tokens.push({ kind: "num", value });
      i = j;
    } else if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z_0-9]/.test(src[j])) j++;
      tokens.push({ kind: "ident", value: src.slice(i, j).toLowerCase() });
      i = j;
    } else if ("+-*/(),".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
    } else {
      throw new Error(`unexpected character '${ch}'`);
    }
  }
  return tokens;
}

export function evaluateFormula(
  src: string,
  vars: Record<string, number>,
): number {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expectOp = (op: string) => {
    const t = next();
    if (!t || t.kind !== "op" || t.value !== op)
      throw new Error(`expected '${op}'`);
  };

  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.kind === "op" && "+-".includes((peek() as Token & { kind: "op" }).value)) {
      const op = (next() as { value: string }).value;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek()?.kind === "op" && "*/".includes((peek() as Token & { kind: "op" }).value)) {
      const op = (next() as { value: string }).value;
      const right = parseFactor();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number {
    const t = next();
    if (!t) throw new Error("unexpected end of formula");
    if (t.kind === "num") return t.value;
    if (t.kind === "op" && t.value === "-") return -parseFactor();
    if (t.kind === "op" && t.value === "(") {
      const v = parseExpr();
      expectOp(")");
      return v;
    }
    if (t.kind === "ident") {
      // function call
      if (peek()?.kind === "op" && (peek() as { value: string }).value === "(") {
        // own-property check: 'constructor' etc. must not resolve
        // through the prototype chain
        const fn = Object.hasOwn(FUNCS, t.value) ? FUNCS[t.value] : undefined;
        if (!fn) throw new Error(`unknown function '${t.value}'`);
        next(); // consume '('
        const args: number[] = [parseExpr()];
        while (peek()?.kind === "op" && (peek() as { value: string }).value === ",") {
          next();
          args.push(parseExpr());
        }
        expectOp(")");
        return fn(...args);
      }
      // variable (own-property check, same reason as functions)
      if (!Object.hasOwn(vars, t.value))
        throw new Error(`unknown variable '${t.value}'`);
      return vars[t.value];
    }
    throw new Error(`unexpected token '${"value" in t ? t.value : ""}'`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("unexpected trailing input");
  if (!Number.isFinite(result)) throw new Error("formula did not produce a finite number");
  return result;
}

/** Validate a tenant-supplied formula before saving it. */
export function validateFormula(src: string): string | null {
  try {
    evaluateFormula(src, { qty: 1, rate: 1, days: 1 });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "invalid formula";
  }
}
