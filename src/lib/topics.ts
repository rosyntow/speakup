export const HOOK_TOPICS = [
  "A tool that saved you 5 hours this week",
  "The biggest mistake beginners make in your niche",
  "Something everyone in your industry is wrong about",
  "Why you stopped doing something that's popular",
  "A 30-second fix for a common problem",
  "What you'd do differently if you started over",
  "A free alternative to an expensive tool",
  "The one habit that changed your results",
  "An unpopular opinion about social media",
  "Something you tested so your viewers don't have to",
  "The question your followers ask you most",
  "A trend that's about to die",
  "How you'd learn your skill in 30 days",
  "The worst advice you ever followed",
  "A behind-the-scenes look at how you make content",
];

export function randomTopic(exclude?: string) {
  const pool = HOOK_TOPICS.filter((t) => t !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}
