import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const DISPLAY_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
];

const resources = {
  en: {
    translation: {
      common: { close: 'Close', save: 'Save', delete: 'Delete', config: 'Config', library: 'Library' },
      library: {
        subtitle: 'Your bilingual great-books shelf',
        eyebrow: 'Library',
        title: 'Choose a book from the shelf.',
        description: 'Upload a source book, keep the original page visible, and generate a facing translation when you read.',
        shelfJson: 'Shelf JSON',
        shelfJsonTitle: 'Download shelf information as JSON',
        loading: 'Loading saved shelf...',
      },
      config: {
        title: 'Reading & Translation Config',
        description: 'Choose languages, provider, model, endpoint, and prompt.',
        motherLanguage: 'Mother Language',
        motherLanguageHint: 'Controls translation and Genie response language.',
        otherLanguage: 'Or type another language',
        displayLanguage: 'Display Language',
        displayLanguageHint: 'Controls menus, buttons, and interface text.',
        activeModel: 'Active Model',
      },
      reader: {
        back: 'Library',
        translate: 'Translate',
        translating: 'Translating {{seconds}}s',
        translateNext: 'Translate next 3',
        previous: 'Previous page',
        next: 'Next page',
        original: 'Original',
        translationTab: 'Translation',
        translation: 'Translation · {{language}}',
        guide: 'GUIDE',
        generatedTranslation: 'Generated translation',
        waitingTranslation: 'Waiting for translation',
        guideDescription: 'Whole-page reading perspective',
        useTranslate: 'Use Translate to create the facing page for this section.',
      },
      genie: {
        name: 'Genie',
        companion: 'Reading with you · {{passage}}',
        close: 'Close reading companion',
        question: 'What are you wondering about?',
        description: 'I can see the passage and its translation. Ask about a phrase, an idea, or what lies between the lines.',
        starterNotice: 'What should I notice here?',
        starterPhrase: 'Explain a difficult phrase',
        starterConnection: 'How does this connect to the larger work?',
        thinking: 'Genie is reading closely…',
        placeholder: 'Ask about this passage…',
        send: 'Send message',
        inputHint: 'Enter to send · Shift + Enter for a new line',
        ask: 'Ask Genie',
        call: 'Call Genie, your reading companion',
      },
    },
  },
  'zh-CN': {
    translation: {
      common: { close: '关闭', save: '保存', delete: '删除', config: '设置', library: '书库' },
      library: {
        subtitle: '你的双语经典阅读书架',
        eyebrow: '书库',
        title: '从书架上选择一本书。',
        description: '上传原文书籍，在阅读时保留原始页面，并生成并排译文。',
        shelfJson: '书架 JSON',
        shelfJsonTitle: '将书架信息下载为 JSON',
        loading: '正在加载已保存的书架…',
      },
      config: {
        title: '阅读与翻译设置',
        description: '选择语言、服务商、模型、接口和提示词。',
        motherLanguage: '母语',
        motherLanguageHint: '控制书籍翻译和 Genie 的回复语言。',
        otherLanguage: '或输入其他语言',
        displayLanguage: '显示语言',
        displayLanguageHint: '控制菜单、按钮和界面文字。',
        activeModel: '当前模型',
      },
      reader: {
        back: '书库',
        translate: '翻译',
        translating: '翻译中 {{seconds}} 秒',
        translateNext: '翻译后 3 页',
        previous: '上一页',
        next: '下一页',
        original: '原文',
        translationTab: '译文',
        translation: '译文 · {{language}}',
        guide: '导读',
        generatedTranslation: '已生成译文',
        waitingTranslation: '等待翻译',
        guideDescription: '整页阅读视角',
        useTranslate: '使用“翻译”生成本节的并排译文。',
      },
      genie: {
        name: 'Genie',
        companion: '与你共读 · {{passage}}',
        close: '关闭阅读助手',
        question: '你正在思考什么？',
        description: '我能看到当前原文和译文。可以询问某个词句、观点，或字里行间的含义。',
        starterNotice: '这里有哪些值得注意的地方？',
        starterPhrase: '解释一个难懂的句子',
        starterConnection: '这与整部作品有什么联系？',
        thinking: 'Genie 正在仔细阅读…',
        placeholder: '询问有关这段文字的问题…',
        send: '发送消息',
        inputHint: '按 Enter 发送 · Shift + Enter 换行',
        ask: '询问 Genie',
        call: '召唤你的阅读助手 Genie',
      },
    },
  },
};

const savedLanguage = localStorage.getItem('luminabook.displayLanguage');
const browserLanguage = navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage || browserLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (language) => {
  localStorage.setItem('luminabook.displayLanguage', language);
  document.documentElement.lang = language;
});

document.documentElement.lang = i18n.language;

export default i18n;
