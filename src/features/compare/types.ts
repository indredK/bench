export interface FilterGroupOption {
  value: string;
  label: string;
}

export interface FilterGroup<T> {
  key: keyof T;
  label: string;
  options?: FilterGroupOption[];
  format?: (value: unknown) => string;
}

export interface SpecRow<T> {
  key: keyof T;
  label: string;
  format?: (val: T[keyof T], model: T) => string;
}

export interface CompareDataModule<T extends { id: string; model: string }> {
  data: T[];
  specRows: SpecRow<T>[];
  numericKeys: (keyof T)[];
  inverseKeys: (keyof T)[];
  i18nPrefix: string;
  filterGroups?: FilterGroup<T>[];
  referenceUrl?: (model: T, key: keyof T) => string | undefined;
}

