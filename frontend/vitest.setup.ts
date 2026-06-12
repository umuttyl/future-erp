import '@testing-library/jest-dom/vitest'
import i18n from './src/i18n'  // i18n init

// Testler deterministik olsun: dili sabit 'tr' yap (ortam navigator diline bağlı kalmasın)
void i18n.changeLanguage('tr')
