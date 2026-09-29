import { describe, expect, it } from "vitest";
import { countHolidays, holidayKeyOf } from "~/lib/holidays";

describe("法定节假日数据（2026 官方安排）", () => {
  it("放假区间内每天都能查到节日名称 key", () => {
    expect(holidayKeyOf("2026-10-01")).toBe("holNationalDay");
    expect(holidayKeyOf("2026-10-07")).toBe("holNationalDay");
    expect(holidayKeyOf("2026-02-17")).toBe("holSpringFestival"); // 正月初一
    expect(holidayKeyOf("2026-09-25")).toBe("holMidAutumn");
    expect(holidayKeyOf("2026-01-01")).toBe("holNewYear");
  });

  it("调休补班日与普通日期不是节假日", () => {
    // 2026 补班日：1/4、2/14、2/28、5/9、9/20、10/10
    for (const key of ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"]) {
      expect(holidayKeyOf(key)).toBeUndefined();
    }
    expect(holidayKeyOf("2026-09-29")).toBeUndefined();
  });

  it("countHolidays 含首尾统计区间内节假日", () => {
    // 9/28–10/2 共 5 天，其中 10/1、10/2 是国庆假期 → 2 天
    expect(countHolidays("2026-09-28", "2026-10-02")).toBe(2);
    // 整个国庆假期
    expect(countHolidays("2026-10-01", "2026-10-07")).toBe(7);
    // 跨中秋+国庆（9/25–10/3：中秋 3 天 + 国庆 3 天）
    expect(countHolidays("2026-09-25", "2026-10-03")).toBe(6);
  });

  it("区间无节假日或起止颠倒时计 0", () => {
    expect(countHolidays("2026-03-02", "2026-03-08")).toBe(0);
    expect(countHolidays("2026-10-05", "2026-10-01")).toBe(0);
    expect(countHolidays("2026-11-11", "2026-11-11")).toBe(0);
  });
});
