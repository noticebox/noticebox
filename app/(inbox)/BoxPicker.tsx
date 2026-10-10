"use client";

import { useId, useState } from "react";

// One writable field for the box: the existing boxes are offered as you type; a name that is none of them can be
// added as a new box with the button that appears, and only then is it sent.
export function BoxPicker({ boxes, defaultValue = "", label = "Box" }: { boxes: string[]; defaultValue?: string; label?: string }) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [added, setAdded] = useState<string | null>(null);
  const typed = value.trim();
  const exists = boxes.includes(typed);
  const isNew = typed !== "" && !exists;
  const chosen = exists || added === typed ? typed : "";
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-bold">
        {label}
      </label>
      <input id={id} list={`${id}-boxes`} value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} autoComplete="off" className="field" placeholder={boxes.length ? "Choose or type a name" : "Type a name"} />
      <datalist id={`${id}-boxes`}>
        {boxes.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <input type="hidden" name="box" value={chosen} />
      {isNew && added !== typed && (
        <button type="button" onClick={() => setAdded(typed)} className="btn mt-2">
          Add “{typed}” as a new box
        </button>
      )}
      {isNew && added === typed && <p className="mt-1 text-[13px] text-accent">“{typed}” will be made with the form.</p>}
      {!isNew && <p className="mt-1 text-[13px] text-muted">{boxes.length ? "An existing box, or a new name." : "The first box; a box groups forms, a site, a project."}</p>}
    </div>
  );
}
