const ruRules = new Intl.PluralRules("ru");

type PluralForms = {
  one: string;
  few: string;
  many: string;
  other?: string;
};

export function pluralize(count: number, forms: PluralForms): string {
  const category = ruRules.select(count);

  switch (category) {
    case "one":
      return forms.one;
    case "few":
      return forms.few;
    case "many":
      return forms.many;
    default:
      return forms.other ?? forms.few;
  }
}

export function pluralizeWithCount(count: number, forms: PluralForms): string {
  return `${count} ${pluralize(count, forms)}`;
}
