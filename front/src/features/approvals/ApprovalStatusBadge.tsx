import React from 'react';
import { ApprovalStatus } from '../../api/approvals';
import { Badge } from '../../components/ui/Badge';
import { statusPresentation } from './approvalLabels';

interface ApprovalStatusBadgeProps {
  status: ApprovalStatus;
}

/** 审批状态徽章。文案严格对齐后端会写入的四种状态。 */
export const ApprovalStatusBadge: React.FC<ApprovalStatusBadgeProps> = ({ status }) => {
  const presentation = statusPresentation[status];
  return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
};
