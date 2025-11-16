interface TimeSnapshot {
  iso: string;
  timestamp: number;
  locale: string;
  timezone: string;
  weekday: string;
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function execute(params: Record<string, unknown>): TimeSnapshot {
  const locale = typeof params.locale === 'string' ? params.locale : 'zh-CN';
  const timezone = typeof params.timezone === 'string' ? params.timezone : 'Asia/Shanghai';

  const now = new Date();
  return {
    iso: now.toISOString(),
    timestamp: now.getTime(),
    locale,
    timezone,
    weekday: WEEKDAYS[now.getDay()],
    parts: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds()
    }
  };
}