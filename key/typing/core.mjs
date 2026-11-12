// Pure helpers shared by the UI and focused input/scoring checks.
export const normalize = text => text.normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\u00a0/g, ' ');
export function strokes(text) {
  // Standard Korean typing count: initial consonant, vowel, final consonant.
  // Compound vowels/finals take two keys; Shift does not add another key.
  const compoundVowels = new Set([9,10,11,14,15,16,19]);
  const compoundFinals = new Set([3,5,6,9,10,11,12,13,14,15,18]);
  return Array.from(text).reduce((sum, char) => {
    const code = char.codePointAt(0)-0xac00;
    if (code<0 || code>11171) return sum+1;
    const vowel = Math.floor(code%588/28), final = code%28;
    return sum+1+(compoundVowels.has(vowel)?2:1)+(final ? (compoundFinals.has(final)?2:1):0);
  },0);
}
export function insertedAttempt(previous, next, target) {
  const a=Array.from(normalize(previous)), b=Array.from(normalize(next)), t=Array.from(target);
  let start=0,endA=a.length,endB=b.length;
  while(start<endA && start<endB && a[start]===b[start]) start++;
  while(endA>start && endB>start && a[endA-1]===b[endB-1]) {endA--;endB--;}
  let attempts=0,errors=0;
  for(let i=start;i<endB;i++) {attempts++;if(b[i]!==t[i]) errors++;}
  return {attempts,errors};
}
export function measure(value,target) {
  const input=Array.from(normalize(value)), expected=Array.from(target);
  let correct=0,correctStrokes=0;
  for(let i=0;i<input.length;i++) if(input[i]===expected[i]) {correct++;correctStrokes+=strokes(input[i]);}
  return {correct,correctStrokes,wrong:input.length-correct,complete:normalize(value)===target};
}
export function shuffled(values,random=Math.random) {
  const out=[...values];
  for(let i=out.length-1;i>0;i--) {const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
