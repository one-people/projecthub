import type { Dict } from "~/locales/zh-CN";
import { dateKey } from "~/lib/calendar";

/** 节假日名称是用户可见文案，本模块只存 i18n Dict key，展示层负责翻译 */
export type HolidayNameKey = keyof Dict;

/**
 * 中国法定节假日放假日期（含调休顺延的连休日；不含调休补班日——补班是工作日）。
 * 依据：《国务院办公厅关于2026年部分节假日安排的通知》（国办发明电〔2025〕7号）。
 * 纯前端应用无网络通道，只能内置数据：每年 11 月前后国务院发布次年安排后需人工更新，
 * 无数据年份不提示名称、天数统计不扣减。
 */
const RANGES: [startKey: string, endKey: string, HolidayNameKey][] = [
  // 元旦 1/1（四）–1/3（六），1/4（日）补班
  ["2026-01-01", "2026-01-03", "holNewYear"],
  // 春节 2/15（日）–2/23（一），2/14、2/28 补班
  ["2026-02-15", "2026-02-23", "holSpringFestival"],
  // 清明 4/4（六）–4/6（一），自然连休
  ["2026-04-04", "2026-04-06", "holQingming"],
  // 劳动节 5/1（五）–5/5（二），5/9（六）补班
  ["2026-05-01", "2026-05-05", "holLaborDay"],
  // 端午 6/19（五）–6/21（日），自然连休
  ["2026-06-19", "2026-06-21", "holDragonBoat"],
  // 中秋 9/25（五）–9/27（日），自然连休
  ["2026-09-25", "2026-09-27", "holMidAutumn"],
  // 国庆 10/1（四）–10/7（三），9/20（日）、10/10（六）补班
  ["2026-10-01", "2026-10-07", "holNationalDay"],
];

const HOLIDAYS: Record<string, HolidayNameKey> = {};
for (const [from, to, name] of RANGES) {
  for (let d = new Date(`${from}T00:00:00`); dateKey(d) <= to; d.setDate(d.getDate() + 1)) {
    HOLIDAYS[dateKey(d)] = name;
  }
}

/** 指定日期（yyyy-mm-dd）是否法定节假日，是则返回其名称的 i18n key */
export function holidayKeyOf(key: string): HolidayNameKey | undefined {
  return HOLIDAYS[key];
}

/** 区间 [startKey, endKey]（含首尾）内的法定节假日天数，用于时间线天数扣减 */
export function countHolidays(startKey: string, endKey: string): number {
  let count = 0;
  for (let d = new Date(`${startKey}T00:00:00`); dateKey(d) <= endKey; d.setDate(d.getDate() + 1)) {
    if (HOLIDAYS[dateKey(d)]) count++;
  }
  return count;
}
