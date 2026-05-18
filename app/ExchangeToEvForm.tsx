"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

const BORDER = "#E0E0E0";
const MAX_PHOTOS = 5;
const TAG_BG = "#E8F4FC";
const TAG_TEXT = "#0c4a6e";

const CITIES = [
  "Itahari",
  "Kathmandu",
  "Pokhara",
  "Lalitpur",
  "Bharatpur",
  "Biratnagar",
  "Other",
];

const VEHICLE_TYPES = [
  "Hatchback",
  "Sedan",
  "SUV",
  "Crossover",
  "Pickup",
  "Van",
  "Two-wheeler",
  "Other",
];

const COLORS = [
  "White",
  "Black",
  "Silver",
  "Gray",
  "Red",
  "Blue",
  "Green",
  "Other",
];

const EV_BRANDS = [
  "BYD",
  "Tesla",
  "Nissan",
  "Hyundai",
  "MG",
  "Tata",
  "Mahindra",
  "Other / undecided",
];

const YES_NO = ["Yes", "No"];

const TRANSMISSION = ["Manual", "Automatic", "CVT", "Other"];

const ACCIDENTS = ["None", "Minor", "Major", "Prefer not to say"];

const FUEL_TYPES = ["Petrol", "Diesel", "Hybrid", "CNG", "LPG", "Other"];

/** Preset options shown when tapping + on Features */
const FEATURE_PRESETS = [
  "Basic",
  "A/C",
  "4WD",
  "ABS",
  "Airbags",
  "Power steering",
  "Power windows",
  "Central locking",
  "Music system",
  "Alloy wheels",
  "Fog lamps",
  "Sunroof",
  "Leather seats",
  "Reverse camera",
  "Cruise control",
  "Keyless entry",
];

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 18a4 4 0 0 1-1.97-7.48 5 5 0 0 1 9.38-2.32A3.5 3.5 0 1 1 17 18H7Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ResetIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 12a8 8 0 1 1 3 6.32"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M4 16V12h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type PillSelectProps = {
  id: string;
  label: string;
  required?: boolean;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

function PillSelect({
  id,
  label,
  required,
  options,
  value,
  onChange,
  placeholder = "Select…",
}: PillSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-normal text-black">
        {label}
        {required ? (
          <span className="text-red-600" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </label>
      <div ref={rootRef} className="relative">
        <button
          id={id}
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full min-h-[42px] items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-left text-[15px] outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-black/15"
          style={{ borderColor: BORDER }}
        >
          <span className="min-w-0 flex-1">
            {value ? (
              <span
                className="inline-flex max-w-full items-center truncate rounded px-2 py-0.5 text-[13px] font-medium"
                style={{ backgroundColor: TAG_BG, color: TAG_TEXT }}
              >
                {value}
              </span>
            ) : (
              <span className="text-zinc-400">{placeholder}</span>
            )}
          </span>
          <ChevronDown className="shrink-0 text-zinc-500" />
        </button>
        {open ? (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-white py-1 shadow-sm"
            style={{ borderColor: BORDER }}
          >
            {options.map((opt) => (
              <li key={opt} role="option" aria-selected={value === opt}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-[14px] text-zinc-800 hover:bg-zinc-50"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function textInputClass() {
  return [
    "w-full rounded-md border bg-white px-3 py-2.5 text-[15px] text-black",
    "placeholder:text-zinc-400 outline-none transition-[box-shadow]",
    "focus-visible:ring-2 focus-visible:ring-black/15",
  ].join(" ");
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function fileExtension(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toUpperCase() : "FILE";
}

type FilePreviewGridProps = {
  files: File[];
  onRemove: (index: number) => void;
};

function FilePreviewGrid({ files, onRemove }: FilePreviewGridProps) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((file) =>
      isImageFile(file) ? URL.createObjectURL(file) : "",
    );
    setPreviewUrls(urls);
    return () => {
      urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [files]);

  if (files.length === 0) return null;

  return (
    <div
      className="grid grid-cols-3 gap-2 sm:grid-cols-4"
      role="list"
      aria-label="Uploaded file previews"
    >
      {files.map((file, index) => {
        const previewUrl = previewUrls[index];
        const image = isImageFile(file) && previewUrl;

        return (
          <div
            key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
            role="listitem"
            className="group relative overflow-hidden rounded-md border bg-zinc-50"
            style={{ borderColor: BORDER }}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={file.name}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square flex-col items-center justify-center gap-1 px-2 text-center">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  {fileExtension(file.name)}
                </span>
                <span className="line-clamp-2 text-[10px] leading-tight text-zinc-600">
                  {file.name}
                </span>
              </div>
            )}
            <button
              type="button"
              aria-label={`Remove ${file.name}`}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-sm leading-none text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              onClick={() => onRemove(index)}
            >
              ×
            </button>
            {image ? (
              <p className="truncate border-t bg-white px-1.5 py-1 text-[10px] text-zinc-600">
                {file.name}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ExchangeToEvForm() {
  const formId = useId();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Kathmandu");
  const [year, setYear] = useState("");
  const [vehicleType, setVehicleType] = useState("Hatchback");
  const [model, setModel] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");
  const [km, setKm] = useState("");
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [evBrand, setEvBrand] = useState("");
  const [finance, setFinance] = useState("");
  const [transmission, setTransmission] = useState("");
  const [accidents, setAccidents] = useState("");
  const [fuelType, setFuelType] = useState("Petrol");
  const [features, setFeatures] = useState<string[]>([]);
  const [featuresPickerOpen, setFeaturesPickerOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const featuresPickerRef = useRef<HTMLDivElement>(null);

  const clear = useCallback(() => {
    setFullName("");
    setEmail("");
    setPhone("");
    setCity("");
    setYear("");
    setVehicleType("");
    setModel("");
    setBrand("");
    setColor("");
    setKm("");
    setDocFiles([]);
    setPhotoFiles([]);
    setEvBrand("");
    setFinance("");
    setTransmission("");
    setAccidents("");
    setFuelType("");
    setFeatures([]);
    setFeaturesPickerOpen(false);
    setNotes("");
    setSubmitError(null);
    setSubmitSuccess(null);
    if (docInputRef.current) docInputRef.current.value = "";
    if (photoInputRef.current) photoInputRef.current.value = "";
  }, []);

  const addPresetFeature = useCallback((name: string) => {
    setFeatures((f) => (f.includes(name) ? f : [...f, name]));
  }, []);

  const removeDocFile = useCallback((index: number) => {
    setDocFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 && docInputRef.current) docInputRef.current.value = "";
      return next;
    });
  }, []);

  const removePhotoFile = useCallback((index: number) => {
    setPhotoFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 && photoInputRef.current)
        photoInputRef.current.value = "";
      return next;
    });
  }, []);

  const addPhotoFiles = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (list.length === 0) return;
    setPhotoFiles((prev) => [...prev, ...list].slice(0, MAX_PHOTOS));
    if (photoInputRef.current) photoInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (!featuresPickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!featuresPickerRef.current?.contains(e.target as Node))
        setFeaturesPickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [featuresPickerOpen]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (
      !fullName.trim() ||
      !phone.trim() ||
      !city ||
      !year.trim() ||
      !vehicleType ||
      !model.trim() ||
      !brand.trim() ||
      !color ||
      !km.trim() ||
      !evBrand ||
      !finance ||
      !transmission ||
      !fuelType
    ) {
      setSubmitError("Please fill in all required fields.");
      return;
    }

    const body = new FormData();
    body.append("fullName", fullName.trim());
    body.append("email", email.trim());
    body.append("phone", phone.trim());
    body.append("city", city);
    body.append("year", year.trim());
    body.append("vehicleType", vehicleType);
    body.append("vehicleBrand", brand.trim());
    body.append("vehicleModel", model.trim());
    body.append("vehicleColor", color);
    body.append("kmDriven", km.trim());
    body.append("evBrand", evBrand);
    body.append("finance", finance);
    body.append("transmission", transmission);
    body.append("accidents", accidents);
    body.append("fuelType", fuelType);
    body.append("features", JSON.stringify(features));
    body.append("notes", notes.trim());
    for (const file of docFiles) body.append("documents", file);
    for (const file of photoFiles) body.append("photos", file);

    setSubmitting(true);
    try {
      const res = await fetch("/api/vehicle-listings", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        warning?: string;
        unmatchedFeatures?: string[];
        featuresColumn?: string;
      };

      if (!res.ok) {
        const unmatchedFeatures = data.unmatchedFeatures ?? [];
        if (res.status === 400 && unmatchedFeatures.length > 0) {
          const fieldLabel = data.featuresColumn ?? "Features";
          setSubmitError(
            `These features are not allowed in "${fieldLabel}": ${unmatchedFeatures.join(", ")}.`,
          );
          return;
        }
        setSubmitError(data.error ?? "Submission failed. Please try again.");
        return;
      }

      const message =
        data.warning ??
        "Thank you! Your exchange request has been submitted.";
      clear();
      setSubmitSuccess(message);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldGap = "flex flex-col gap-7";

  return (
    <form
      id={formId}
      onSubmit={onSubmit}
      className={fieldGap}
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${formId}-name`} className="text-[13px] text-black">
          Full Name<span className="text-red-600"> *</span>
        </label>
        <input
          id={`${formId}-name`}
          className={textInputClass()}
          style={{ borderColor: BORDER }}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${formId}-email`} className="text-[13px] text-black">
          Email
        </label>
        <input
          id={`${formId}-email`}
          type="email"
          className={textInputClass()}
          style={{ borderColor: BORDER }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${formId}-phone`} className="text-[13px] text-black">
          Phone<span className="text-red-600"> *</span>
        </label>
        <input
          id={`${formId}-phone`}
          type="tel"
          className={textInputClass()}
          style={{ borderColor: BORDER }}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />
      </div>

      <PillSelect
        id={`${formId}-city`}
        label="City"
        required
        options={CITIES}
        value={city}
        onChange={setCity}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${formId}-year`} className="text-[13px] text-black">
          Year of Manufacture<span className="text-red-600"> *</span>
        </label>
        <input
          id={`${formId}-year`}
          className={textInputClass()}
          style={{ borderColor: BORDER }}
          placeholder="2007"
          inputMode="numeric"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
      </div>

      <PillSelect
        id={`${formId}-vtype`}
        label="Vehicle Type"
        required
        options={VEHICLE_TYPES}
        value={vehicleType}
        onChange={setVehicleType}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${formId}-model`} className="text-[13px] text-black">
          Vehicle Model<span className="text-red-600"> *</span>
        </label>
        <input
          id={`${formId}-model`}
          className={textInputClass()}
          style={{ borderColor: BORDER }}
          placeholder="Santro"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${formId}-brand`} className="text-[13px] text-black">
          Vehicle Brand<span className="text-red-600"> *</span>
        </label>
        <input
          id={`${formId}-brand`}
          className={textInputClass()}
          style={{ borderColor: BORDER }}
          placeholder="Hyundai"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        />
      </div>

      <PillSelect
        id={`${formId}-color`}
        label="Vehicle Color"
        required
        options={COLORS}
        value={color}
        onChange={setColor}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${formId}-km`} className="text-[13px] text-black">
          KM Driven<span className="text-red-600"> *</span>
        </label>
        <input
          id={`${formId}-km`}
          className={textInputClass()}
          style={{ borderColor: BORDER }}
          inputMode="numeric"
          value={km}
          onChange={(e) => setKm(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-black">Upload Vehicle Document</span>
        <label
          className="flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-white px-4 py-6 text-center"
          style={{ borderColor: BORDER }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const list = e.dataTransfer.files;
            if (list?.length) setDocFiles(Array.from(list));
          }}
        >
          <CloudIcon className="text-zinc-400" />
          <span className="text-[14px] text-zinc-600">
            Drop files here or{" "}
            <span className="text-blue-600 underline">browse</span>
          </span>
          <input
            ref={docInputRef}
            type="file"
            className="sr-only"
            multiple
            onChange={(e) =>
              setDocFiles(e.target.files ? Array.from(e.target.files) : [])
            }
          />
        </label>
        <FilePreviewGrid files={docFiles} onRemove={removeDocFile} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-black">Upload Vehicle Photo</span>
        <label
          className="flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-white px-4 py-6 text-center"
          style={{ borderColor: BORDER }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files?.length) addPhotoFiles(e.dataTransfer.files);
          }}
        >
          <CloudIcon className="text-zinc-400" />
          <span className="text-[14px] text-zinc-600">
            Drop files here or{" "}
            <span className="text-blue-600 underline">browse</span>
            {photoFiles.length < MAX_PHOTOS ? (
              <span className="block text-[12px] text-zinc-500">
                Up to {MAX_PHOTOS} photos
              </span>
            ) : null}
          </span>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            multiple
            onChange={(e) => {
              if (e.target.files?.length) addPhotoFiles(e.target.files);
            }}
          />
        </label>
        {photoFiles.length >= MAX_PHOTOS ? (
          <p className="text-[12px] text-zinc-500">
            Maximum {MAX_PHOTOS} photos reached.
          </p>
        ) : null}
        <FilePreviewGrid files={photoFiles} onRemove={removePhotoFile} />
      </div>


      <PillSelect
        id={`${formId}-gear`}
        label="Transmission / Gear"
        required
        options={TRANSMISSION}
        value={transmission}
        onChange={setTransmission}
      />

      <PillSelect
        id={`${formId}-acc`}
        label="Accidents"
        options={ACCIDENTS}
        value={accidents}
        onChange={setAccidents}
      />


      <PillSelect
        id={`${formId}-fuel`}
        label="Fuel Type"
        required
        options={FUEL_TYPES}
        value={fuelType}
        onChange={setFuelType}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-black">Features</span>
        <div ref={featuresPickerRef} className="relative">
          <div
            className="flex min-h-[42px] flex-wrap items-center gap-2 rounded-md border bg-white px-2 py-1.5"
            style={{ borderColor: BORDER }}
          >
            <button
              type="button"
              aria-expanded={featuresPickerOpen}
              aria-haspopup="listbox"
              aria-label="Choose features"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-200 text-lg leading-none text-zinc-600 hover:bg-zinc-50"
              onClick={() => setFeaturesPickerOpen((o) => !o)}
            >
              +
            </button>
            {features.map((f, i) => (
              <span
                key={`${f}-${i}`}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-medium"
                style={{ backgroundColor: TAG_BG, color: TAG_TEXT }}
              >
                {f}
                <button
                  type="button"
                  className="text-zinc-500 hover:text-zinc-800"
                  aria-label={`Remove ${f}`}
                  onClick={() =>
                    setFeatures((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  ×
                </button>
              </span>
            ))}
            {features.length === 0 ? (
              <span className="text-[14px] text-zinc-400">
                Tap + to add (Basic, A/C, 4WD, …)
              </span>
            ) : null}
          </div>
          {featuresPickerOpen ? (
            <ul
              role="listbox"
              aria-label="Feature presets"
              className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-white py-1 shadow-sm"
              style={{ borderColor: BORDER }}
            >
              {FEATURE_PRESETS.map((name) => {
                const taken = features.includes(name);
                return (
                  <li key={name} role="option" aria-selected={taken}>
                    <button
                      type="button"
                      disabled={taken}
                      className={
                        taken
                          ? "w-full cursor-default px-3 py-2 text-left text-[14px] text-zinc-400"
                          : "w-full px-3 py-2 text-left text-[14px] text-zinc-800 hover:bg-zinc-50"
                      }
                      onClick={() => addPresetFeature(name)}
                    >
                      {name}
                      {taken ? " · added" : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>

      <PillSelect
        id={`${formId}-ev`}
        label="Interested EV Brand"
        required
        options={EV_BRANDS}
        value={evBrand}
        onChange={setEvBrand}
      />

      <PillSelect
        id={`${formId}-fin`}
        label="Are you looking for Finance?"
        required
        options={YES_NO}
        value={finance}
        onChange={setFinance}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${formId}-notes`} className="text-[13px] text-black">
          Notes
        </label>
        <textarea
          id={`${formId}-notes`}
          rows={5}
          className={textInputClass() + " resize-y min-h-[120px]"}
          style={{ borderColor: BORDER }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {submitError ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
        >
          {submitError}
        </p>
      ) : null}
      {submitSuccess ? (
        <p
          role="status"
          className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-[13px] text-green-800"
        >
          {submitSuccess}
        </p>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={clear}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 text-[14px] text-blue-600 hover:underline disabled:opacity-50"
        >
          <ResetIcon className="text-blue-600" />
          Clear form
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-black px-5 py-2 text-[13px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>

      <p className="pt-2 text-center text-[11px] leading-relaxed text-zinc-400">
        Do not submit passwords through this form. Report malicious form
      </p>
    </form>
  );
}
