import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';

/**
 * 用户画像接口的响应体.
 * 后端只返回 profile 与 version 两个字段, 因此这里不声明其他字段.
 */
export interface UserProfileResponse {
  profile: string;
  version: number;
}

export interface UpdateUserProfileInput {
  /** Markdown 纯文本, 允许空字符串 (后端无应用层长度上限). */
  profile: string;
  /** 乐观锁期望版本; 首次写入为服务端当前返回的 version. */
  expectedVersion: number;
}

export const userProfileQueryKey = ['user-profile'] as const;

export const fetchUserProfile = (signal?: AbortSignal): Promise<UserProfileResponse> =>
  apiRequest<UserProfileResponse>('/api/web/user-profile', { signal });

export const userProfileQueryOptions = () =>
  queryOptions({
    queryKey: userProfileQueryKey,
    queryFn: ({ signal }) => fetchUserProfile(signal)
  });

/**
 * PUT /api/web/user-profile. 两个字段都必须出现:
 * profile 允许空字符串, expected_version 允许 0 (首次写入).
 */
export const updateUserProfile = (input: UpdateUserProfileInput): Promise<UserProfileResponse> =>
  apiRequest<UserProfileResponse>('/api/web/user-profile', {
    method: 'PUT',
    body: {
      profile: input.profile,
      expected_version: input.expectedVersion
    }
  });

export const updateUserProfileMutationOptions = () =>
  mutationOptions({
    mutationFn: updateUserProfile
  });
