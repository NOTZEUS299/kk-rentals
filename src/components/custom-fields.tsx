import type { CustomFieldDef, CustomFieldValues } from "@/lib/custom-fields";
import { Input, Label, Select } from "@/components/ui";

const textareaClass =
  "min-h-20 w-full rounded-app border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

/**
 * One admin-defined field. Uncontrolled (name/defaultValue) inside a
 * FormData form; pass value/onChange for controlled use (challan form).
 */
export function CustomFieldControl({
  field,
  name,
  defaultValue,
  value,
  onChange,
}: {
  field: CustomFieldDef;
  name?: string;
  defaultValue?: string | number | boolean | null;
  value?: string | boolean;
  onChange?: (value: string | boolean) => void;
}) {
  const controlled = onChange !== undefined;
  const id = name ?? `cf_${field.key}`;

  if (field.type === "checkbox") {
    return (
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          id={id}
          name={name}
          className="h-4 w-4 accent-[var(--primary,#0f766e)]"
          {...(controlled
            ? { checked: value === true, onChange: (e) => onChange(e.target.checked) }
            : { defaultChecked: defaultValue === true })}
        />
        {field.label}
      </label>
    );
  }

  const common = controlled
    ? {
        id,
        value: typeof value === "string" ? value : "",
        onChange: (
          e: React.ChangeEvent<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          >,
        ) => onChange(e.target.value),
      }
    : { id, name, defaultValue: defaultValue == null ? "" : String(defaultValue) };

  return (
    <div>
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === "select" ? (
        <Select required={field.required} {...common}>
          <option value=""></option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      ) : field.type === "textarea" ? (
        <textarea className={textareaClass} required={field.required} {...common} />
      ) : (
        <Input
          type={
            field.type === "number"
              ? "number"
              : field.type === "date"
                ? "date"
                : "text"
          }
          step={field.type === "number" ? "any" : undefined}
          inputMode={field.type === "number" ? "decimal" : undefined}
          required={field.required}
          {...common}
        />
      )}
    </div>
  );
}

/**
 * All custom fields of an entity as uncontrolled inputs named
 * cf_<key>, for server-action forms. Renders nothing when the
 * tenant has no fields defined.
 */
export function CustomFieldInputs({
  fields,
  values,
}: {
  fields: CustomFieldDef[];
  values?: CustomFieldValues | null;
}) {
  if (fields.length === 0) return null;
  return (
    <>
      {fields.map((field) => (
        <CustomFieldControl
          key={field.key}
          field={field}
          name={`cf_${field.key}`}
          defaultValue={values?.[field.key] ?? null}
        />
      ))}
    </>
  );
}
