import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Chinese
import zhCommon from './locales/zh/common.json';
import zhNav from './locales/zh/nav.json';
import zhWorkspace from './locales/zh/workspace.json';
import zhProject from './locales/zh/project.json';
import zhStage from './locales/zh/stage.json';
import zhSettings from './locales/zh/settings.json';
import zhChat from './locales/zh/chat.json';
import zhAsset from './locales/zh/asset.json';
import zhPlugin from './locales/zh/plugin.json';
import zhError from './locales/zh/error.json';
import zhOnboarding from './locales/zh/onboarding.json';

// English
import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enWorkspace from './locales/en/workspace.json';
import enProject from './locales/en/project.json';
import enStage from './locales/en/stage.json';
import enSettings from './locales/en/settings.json';
import enChat from './locales/en/chat.json';
import enAsset from './locales/en/asset.json';
import enPlugin from './locales/en/plugin.json';
import enError from './locales/en/error.json';
import enOnboarding from './locales/en/onboarding.json';

export const defaultNS = 'common';
export const resources = {
  zh: {
    common: zhCommon,
    nav: zhNav,
    workspace: zhWorkspace,
    project: zhProject,
    stage: zhStage,
    settings: zhSettings,
    chat: zhChat,
    asset: zhAsset,
    plugin: zhPlugin,
    error: zhError,
    onboarding: zhOnboarding,
  },
  en: {
    common: enCommon,
    nav: enNav,
    workspace: enWorkspace,
    project: enProject,
    stage: enStage,
    settings: enSettings,
    chat: enChat,
    asset: enAsset,
    plugin: enPlugin,
    error: enError,
    onboarding: enOnboarding,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    fallbackLng: 'zh',
    ns: [
      'common', 'nav', 'workspace', 'project', 'stage',
      'settings', 'chat', 'asset', 'plugin', 'error', 'onboarding',
    ],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'koma-lang',
    },
  });

export default i18n;
