import { ApprovalSwitchKey } from '../../api/settings';

/**
 * 13 个 CLI 审批开关的中文标签, 按资源分组展示。
 * 与后端 platform/settings 登记的 key 一一对应, 集中在此避免多处硬编码。
 */
export const approvalGroups: { title: string; items: { key: ApprovalSwitchKey; label: string }[] }[] = [
  {
    title: 'Card',
    items: [
      { key: 'enable_cli_card_create_approval', label: 'CLI 新建 Card 需要审批' },
      { key: 'enable_cli_card_update_approval', label: 'CLI 修改 Card 需要审批' },
      { key: 'enable_cli_card_trash_approval', label: 'CLI 删除 Card 需要审批' },
      { key: 'enable_cli_card_restore_approval', label: 'CLI 恢复 Card 需要审批' },
      { key: 'enable_cli_card_merge_approval', label: 'CLI 合并 Card 需要审批' }
    ]
  },
  {
    title: 'Topic',
    items: [
      { key: 'enable_cli_topic_create_approval', label: 'CLI 新建 Topic 需要审批' },
      { key: 'enable_cli_topic_update_approval', label: 'CLI 修改 Topic 需要审批' },
      { key: 'enable_cli_topic_trash_approval', label: 'CLI 删除 Topic 需要审批' },
      { key: 'enable_cli_topic_restore_approval', label: 'CLI 恢复 Topic 需要审批' }
    ]
  },
  {
    title: 'Glossary',
    items: [
      { key: 'enable_cli_glossary_create_approval', label: 'CLI 新建 Glossary 需要审批' },
      { key: 'enable_cli_glossary_update_approval', label: 'CLI 修改 Glossary 需要审批' },
      { key: 'enable_cli_glossary_trash_approval', label: 'CLI 删除 Glossary 需要审批' },
      { key: 'enable_cli_glossary_restore_approval', label: 'CLI 恢复 Glossary 需要审批' }
    ]
  }
];
