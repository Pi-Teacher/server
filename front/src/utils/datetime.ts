// 统一的时间展示格式: 后端返回 UTC ISO 字符串, 这里按本地时区渲染为
// "YYYY-MM-DD HH:mm". 解析失败时原样返回, 避免把异常数据变成 Invalid Date.
export const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};
