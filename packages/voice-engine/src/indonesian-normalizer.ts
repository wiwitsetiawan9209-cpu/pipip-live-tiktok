export const INDONESIAN_TTS_TEST_PHRASE='Halo semuanya, selamat datang di live Pipip. Yang baru masuk, merapat dulu. Hari ini kita ngobrol santai sambil lihat beberapa produk menarik.';
export const INDONESIAN_PRONUNCIATION_PHRASES=[
  'Halo semuanya.',
  'Harganya delapan puluh sembilan ribu rupiah.',
  'Stoknya masih tersedia.',
  'Produk ini beratnya lima ratus gram.',
  'Kalau cocok, cek produknya di etalase.',
  'Yang baru masuk, merapat dulu.',
  'Menurut saya, bagian ini menarik.',
] as const;

export function normalizeIndonesianSpeech(text:string,protectedTerms:string[]=[]):string{
  const held:string[]=[];const stash=(value:string)=>{const key=`\uE000${held.length}\uE001`;held.push(value);return key;};let normalized=text;
  for(const term of [...new Set(protectedTerms.filter(Boolean))].sort((a,b)=>b.length-a.length))normalized=normalized.replace(new RegExp(escapeRegExp(term),'giu'),match=>stash(match));
  normalized=normalized.replace(/https?:\/\/[^\s]+|www\.[^\s]+/giu,match=>stash(match));
  normalized=normalized.replace(/\b(?!Rp\d)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*\b/giu,match=>stash(match));
  normalized=normalized.replace(/\bRp\s*([0-9][0-9.]*[0-9]?)(?:,([0-9]+))?\b/giu,(_match,raw:string,decimal:string|undefined)=>{const amount=Number(raw.replaceAll('.',''));if(!Number.isSafeInteger(amount))return _match;return `${numberToIndonesian(amount)}${decimal?` koma ${decimal.split('').map(d=>DIGIT_NAMES[Number(d)]).join(' ')}`:''} rupiah`;});
  normalized=normalized.replace(/(?<![\p{L}\p{N}])([0-9][0-9.]*)\s*(kg|kilogram|g|gram)(?![\p{L}\p{N}])/giu,(_match,raw:string,unit:string)=>{const amount=Number(raw.replaceAll('.',''));if(!Number.isSafeInteger(amount))return _match;return `${numberToIndonesian(amount)} ${/^k/iu.test(unit)?'kilogram':'gram'}`;});
  normalized=normalized.replace(/(?<![\p{L}\p{N}])([0-9][0-9.]*)\s*%(?![\p{L}\p{N}])/gu,(_match,raw:string)=>{const amount=Number(raw.replaceAll('.',''));if(!Number.isSafeInteger(amount))return _match;return `${numberToIndonesian(amount)} persen`;});
  return normalized.replace(/\uE000(\d+)\uE001/gu,(_match,index:string)=>held[Number(index)]??'');
}

export function numberToIndonesian(value:number):string{
  if(!Number.isSafeInteger(value)||value<0||value>=1_000_000_000_000)throw new Error('Number is outside the supported Indonesian speech range.');
  if(value===0)return'nol';const parts:string[]=[];let remaining=value;const scales:[number,string][]=[[1_000_000_000,'miliar'],[1_000_000,'juta'],[1_000,'ribu']];for(const[scale,name]of scales){const amount=Math.floor(remaining/scale);if(amount){parts.push(scale===1000&&amount===1?'seribu':`${underThousand(amount)} ${name}`);remaining%=scale;}}if(remaining)parts.push(underThousand(remaining));return parts.join(' ').trim();
}

function underThousand(n:number):string{if(n<12)return BASIC[n]!;if(n<20)return n===10?'sepuluh':n===11?'sebelas':`${BASIC[n%10]} belas`;if(n<100)return n%10?`${BASIC[Math.floor(n/10)]} puluh ${BASIC[n%10]}`:`${BASIC[Math.floor(n/10)]} puluh`;if(n<200)return n===100?'seratus':`seratus ${underThousand(n-100)}`;return n%100?`${BASIC[Math.floor(n/100)]} ratus ${underThousand(n%100)}`:`${BASIC[Math.floor(n/100)]} ratus`;}
const BASIC=['nol','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'] as const;
const DIGIT_NAMES=BASIC;
function escapeRegExp(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
