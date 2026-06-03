import {
  applyTranslationFields,
  isLocalizationEntityType,
  normalizeLocale,
  normalizeLocaleStrict,
  pickAllowedTranslationFields,
} from './localization.util';

describe('localization utilities', () => {
  it('normalizes locale values and falls back for invalid input', () => {
    expect(normalizeLocale('AR')).toBe('ar');
    expect(normalizeLocale('pt_BR')).toBe('pt-br');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale('bad locale')).toBe('en');
    expect(normalizeLocale('bad locale', 'de')).toBe('de');
  });

  it('throws when strict locale input is invalid', () => {
    expect(normalizeLocaleStrict('EN_us')).toBe('en-us');
    expect(() => normalizeLocaleStrict('')).toThrow('Invalid locale');
    expect(() => normalizeLocaleStrict('en us')).toThrow('Invalid locale');
  });

  it('checks supported localization entity types', () => {
    expect(isLocalizationEntityType('MENU_ITEM')).toBe(true);
    expect(isLocalizationEntityType('ORDER')).toBe(false);
  });

  it('keeps only allowlisted string fields for an entity type', () => {
    expect(
      pickAllowedTranslationFields('MENU_ITEM', {
        name: '  Burger AR  ',
        description: ' ',
        ingredients: null,
        basePrice: '1000',
        unknown: 'ignored',
      }),
    ).toEqual({
      name: 'Burger AR',
      ingredients: null,
    });
  });

  it('applies translated fields without overwriting defaults with nulls', () => {
    expect(
      applyTranslationFields(
        { id: 'item-1', name: 'Burger', description: 'Default' },
        { name: 'برجر', description: null },
      ),
    ).toEqual({
      id: 'item-1',
      name: 'برجر',
      description: 'Default',
    });
  });
});
