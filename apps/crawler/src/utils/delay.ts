export async function randomDelay(min = 2000, max = 4000): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min) + min);
  await new Promise((resolve) => setTimeout(resolve, ms));
}
