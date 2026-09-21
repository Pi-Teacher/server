import React from 'react';
import { Modal } from './ui/Modal';

interface ConceptEntry {
  name: string;
  description: string;
}

/**
 * 核心概念: 产品的记忆模型基础, 释义以业务定义为准。
 */
const CORE_CONCEPTS: ConceptEntry[] = [
  {
    name: '术语表',
    description: '用户已经彻底理解的概念。收录即代表已掌握，不再参与复习排期。'
  },
  {
    name: '卡片',
    description: '学习时产生、需要长期记忆的知识点，使用 FSRS 算法安排复习时间。'
  },
  {
    name: '知识分类 (Topic)',
    description: '对卡片与术语进行归类的主题，用于组织学习范围并筛选复习队列。'
  },
  {
    name: '卡片复习 (Review · FSRS)',
    description:
      '按 FSRS 排期复习到期卡片并评分 (Again / Hard / Good / Easy)，算法据此调整下次复习时间。'
  }
];

/**
 * 功能入口: 与侧栏导航按钮一一对应的简短说明。
 */
const FEATURES: ConceptEntry[] = [
  { name: 'Dashboard', description: '首页仪表盘，只读展示今日待复习、今日复习与制卡统计，以及学习热力图。' },
  { name: '卡片管理', description: '搜索、筛选并维护卡片，查看所属分类、Embedding 状态与版本信息。' },
  { name: '提案审批', description: '审核 CLI 通过 AI 提交的合并、提取等提案，决定是否写入正式数据。' },
  { name: '审批开关控制', description: '按操作类型开关 CLI 写入是否需要人工审批。' },
  { name: '回收站', description: '查看已放入回收站的卡片、知识分类与术语，可恢复或彻底删除。' },
  { name: '日志查看', description: '查看系统运行与操作日志，便于排查问题。' },
  { name: '系统设置', description: '配置时区、日志级别与数据保留策略等实例级设置。' },
  { name: '个人信息与偏好', description: '维护用户画像与学习偏好。' }
];

const ConceptList: React.FC<{ title: string; entries: ConceptEntry[] }> = ({ title, entries }) => (
  <section className="space-y-3">
    <h3 className="font-mono text-label-sm uppercase tracking-widest text-primary">{title}</h3>
    <dl className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.name} className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-3">
          <dt className="text-[14px] font-semibold text-on-surface">{entry.name}</dt>
          <dd className="mt-1 text-body-sm text-on-surface-variant">{entry.description}</dd>
        </div>
      ))}
    </dl>
  </section>
);

interface ConceptHelpModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 使用说明弹窗: 解释系统中各概念的语义与各功能入口的用途。
 * 只展示静态说明文字, 不请求任何数据。
 */
export const ConceptHelpModal: React.FC<ConceptHelpModalProps> = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="使用说明" size="lg">
    <p className="text-body-md text-on-surface-variant">
      本实例围绕“卡片 + 术语”的记忆模型工作。下面的概念与侧栏功能入口一一对应。
    </p>
    <div className="mt-5 space-y-6">
      <ConceptList title="核心概念" entries={CORE_CONCEPTS} />
      <ConceptList title="功能入口" entries={FEATURES} />
    </div>
  </Modal>
);
