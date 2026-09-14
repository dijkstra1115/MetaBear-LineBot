// Match the entire message: a greeting followed by a real question must still
// reach the question router. Ignore decoration such as punctuation and emoji.
export function isGreeting(text: string): boolean {
  const plain = text
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}\p{Z}\s\uFE0F\u200D]/gu, "");
  return /^(?:哈[囉啰嘍喽羅摟囖]+|嗨+|嘿+|[你您]好(?:嗎|呀|啊|喔|唷)?|大家好|你們好|早安|午安|晚安|早上好|下午好|晚上好|安安|在嗎|有人嗎|hi+|hello+|hey+)(?:呀|啊|喔|唷)?$/i.test(
    plain,
  );
}
