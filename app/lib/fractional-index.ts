// 封装 fractional-indexing 库：生成两个既有 key 之间的排序键，
// 使拖拽落位只需写一条记录（O(1)），key 为字典序可比的字符串。
export { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
