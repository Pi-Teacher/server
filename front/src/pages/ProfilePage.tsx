import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, getApiErrorMessage } from '../api/client';
import {
  updateUserProfileMutationOptions,
  userProfileQueryKey,
  userProfileQueryOptions
} from '../api/userProfile';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { Button } from '../components/ui/Button';
import { ConflictDialog } from '../components/ui/ConflictDialog';
import { Textarea } from '../components/ui/FormControls';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../components/ui/States';
import { Toast } from '../components/ui/Toast';

type MobileView = 'edit' | 'preview';

export const ProfilePage: React.FC = () => {
  const queryClient = useQueryClient();
  const profileQuery = useQuery(userProfileQueryOptions());
  const updateMutation = useMutation(updateUserProfileMutationOptions());

  const [profileText, setProfileText] = useState('');
  // serverProfile/serverVersion 表示"已保存的服务端状态", 用于判断是否有未保存修改,
  // 以及提交时携带正确的 expected_version.
  const [serverProfile, setServerProfile] = useState('');
  const [serverVersion, setServerVersion] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('edit');
  const [isConflictOpen, setIsConflictOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  // 同步服务端数据到编辑器的幂等保护, 避免同一份数据重复覆盖用户正在输入的内容.
  const loadedVersionRef = useRef<number | null>(null);
  // 与 React Query 的 isPending 并行使用, 防止同一帧内重复触发提交.
  const submitLockRef = useRef(false);

  useEffect(() => {
    const data = profileQuery.data;
    if (data === undefined) return;
    if (loadedVersionRef.current === data.version) return;
    loadedVersionRef.current = data.version;
    setServerProfile(data.profile);
    setServerVersion(data.version);
    setProfileText(data.profile);
  }, [profileQuery.data]);

  const isSubmitting = updateMutation.isPending;
  const isDirty = serverVersion !== null && profileText !== serverProfile;
  const canSave = serverVersion !== null && isDirty && !isSubmitting;

  const handleSave = () => {
    if (serverVersion === null || !isDirty) return;
    if (submitLockRef.current || updateMutation.isPending) return;
    submitLockRef.current = true;
    setSuccessMessage(undefined);
    setSubmitError(undefined);

    updateMutation.mutate(
      { profile: profileText, expectedVersion: serverVersion },
      {
        onSuccess: (data) => {
          // 保存成功后以服务端返回的新 version 为准, 不在前端自行推算.
          queryClient.setQueryData(userProfileQueryKey, data);
          loadedVersionRef.current = data.version;
          setServerProfile(data.profile);
          setServerVersion(data.version);
          setProfileText(data.profile);
          setSuccessMessage(`用户画像已保存，当前 version 为 ${data.version}`);
        },
        onError: (error: unknown) => {
          // 版本冲突不自动覆盖或自动重试, 保留用户当前编辑内容, 交由用户决定.
          if (error instanceof ApiError && error.code === 'version_conflict') {
            setSubmitError('服务端用户画像已被其他修改，当前编辑内容尚未保存。');
            setIsConflictOpen(true);
            return;
          }
          setSubmitError(getApiErrorMessage(error));
        },
        onSettled: () => {
          submitLockRef.current = false;
        }
      }
    );
  };

  const handleReloadConflict = async () => {
    setIsConflictOpen(false);
    // 清空幂等标记, 强制下一次数据到达时用最新服务端内容替换编辑器.
    loadedVersionRef.current = null;
    await profileQuery.refetch();
  };

  let content: React.ReactNode;
  if (profileQuery.isPending) {
    content = <LoadingState title="正在加载用户画像" description="正在读取 Markdown 内容与 version。" />;
  } else if (profileQuery.isError) {
    content = (
      <ErrorState
        title="用户画像加载失败"
        description={getApiErrorMessage(profileQuery.error)}
        onRetry={() => void profileQuery.refetch()}
      />
    );
  } else {
    content = (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-1 lg:hidden">
            <button
              type="button"
              aria-pressed={mobileView === 'edit'}
              onClick={() => setMobileView('edit')}
              className={`rounded-lg px-4 py-1.5 text-body-sm font-semibold transition-colors ${
                mobileView === 'edit' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
              }`}
            >
              编辑
            </button>
            <button
              type="button"
              aria-pressed={mobileView === 'preview'}
              onClick={() => setMobileView('preview')}
              className={`rounded-lg px-4 py-1.5 text-body-sm font-semibold transition-colors ${
                mobileView === 'preview' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
              }`}
            >
              预览
            </button>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && !isSubmitting && (
              <span role="status" className="font-mono text-[11px] text-tertiary">
                有未保存的修改
              </span>
            )}
            <span className="font-mono text-label-sm text-on-surface-variant">
              version {serverVersion ?? 0}
            </span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={mobileView === 'edit' ? 'block' : 'hidden lg:block'}>
            <div className="flex h-full flex-col rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 shadow-subtle sm:p-5">
              <Textarea
                label="用户画像 Markdown"
                name="profile-markdown"
                rows={18}
                value={profileText}
                disabled={isSubmitting}
                hint="支持 Markdown 语法，内容会以纯文本保存到服务端。"
                onChange={(event) => {
                  setProfileText(event.target.value);
                  setSuccessMessage(undefined);
                }}
                className="font-mono text-[13px] leading-6"
              />
            </div>
          </section>

          <section className={mobileView === 'preview' ? 'block' : 'hidden lg:block'}>
            <div className="flex h-full flex-col rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 shadow-subtle sm:p-5">
              <p className="mb-3 font-mono text-label-sm uppercase tracking-widest text-primary">预览</p>
              {profileText.trim() === '' ? (
                <p className="text-body-md text-on-surface-variant">
                  当前画像为空。填写 Markdown 后点击保存，即可让 AI agent 在制卡时读取你的背景。
                </p>
              ) : (
                <MarkdownRenderer content={profileText} />
              )}
            </div>
          </section>
        </div>

        {submitError !== undefined && (
          <div
            role="alert"
            className="rounded-xl border border-error/25 bg-error-container px-4 py-3 text-body-md text-on-error-container"
          >
            {submitError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="secondary"
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setProfileText(serverProfile);
              setSubmitError(undefined);
              setSuccessMessage(undefined);
            }}
          >
            放弃修改
          </Button>
          <Button type="button" isLoading={isSubmitting} disabled={!canSave} onClick={handleSave}>
            保存画像
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-surface">
      <PageHeader
        eyebrow="阶段 5"
        title="个人信息与偏好"
        description="使用 Markdown 维护用户画像，AI agent 在制卡前会读取它来组织更贴合你背景的例子。"
      />
      <main className="space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {successMessage !== undefined && <Toast message={successMessage} tone="success" />}
        {content}
      </main>

      <ConflictDialog
        open={isConflictOpen}
        title="用户画像版本冲突"
        description="服务端用户画像已被其他操作修改，你的编辑内容没有被覆盖或自动重试。可以先复制当前内容，再重新加载最新版本。"
        copyText={profileText}
        closeLabel="继续编辑"
        reloadLabel="重新加载最新版本"
        onClose={() => setIsConflictOpen(false)}
        onReload={() => void handleReloadConflict()}
      />
    </div>
  );
};

export default ProfilePage;
