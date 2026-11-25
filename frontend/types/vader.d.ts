declare module "vader-sentiment/src/vader_lexicon.js" {
  export const lexicon: Record<string, number>;
}

declare module "vader-sentiment/src/vaderSentiment.js" {
  interface VaderScores {
    neg: number;
    neu: number;
    pos: number;
    compound: number;
  }
  export const SentimentIntensityAnalyzer: {
    polarity_scores(text: string): VaderScores;
  };
}
