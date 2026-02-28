export interface GameRecord {
  name: string;
  avatar: string;
  date: string;
  duration: number;
  correct: number;
  total: number;
  percent: number;
}

export interface Question {
  a: number;
  b: number;
  type: "multiplication" | "division";
  answer: number;
  options: number[];
  isHardQuestion: boolean;
}