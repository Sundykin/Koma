/**
 * i18n 国际化配置
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

// 获取保存的语言设置，默认为中文
const savedLanguage = localStorage.getItem('app-language') || 'zh-CN';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    lng: savedLanguage,
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

// 切换语言
export function changeLanguage(lang: 'zh-CN' | 'en-US') {
  localStorage.setItem('app-language', lang);
  i18n.changeLanguage(lang);
}

// 获取当前语言
export function getCurrentLanguage(): string {
  return i18n.language;
}
