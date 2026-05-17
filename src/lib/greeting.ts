export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了，如有不适请放心告诉我们。';
  if (hour < 12) return '早上好，今天感觉怎么样？';
  if (hour < 18) return '下午好，我们在这里陪您。';
  return '晚上好，如有不适请随时记录。';
}
