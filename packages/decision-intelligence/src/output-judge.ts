import {ProductClaimPolicy} from '../../product-engine/src/index.js';
import type {VerifiedProductContext} from '../../shared-types/src/index.js';
export type OutputJudgment={status:'PASS'|'RETRY'|'REJECT'|'ESCALATE';reasonCode:string};
export class OutputJudge {
  constructor(private readonly claimPolicy=new ProductClaimPolicy()){}
  judge(speech:string,product?:VerifiedProductContext|null):OutputJudgment {
    if(!speech.trim())return{status:'REJECT',reasonCode:'EMPTY_OUTPUT'};
    if(/\b(?:pesanan|order|transaksi|pembayaran|pembelian|sudah dikirim|sudah diproses|sudah dibeli|sudah terbayar|berhasil dibeli)\b/iu.test(speech))return{status:'REJECT',reasonCode:'UNVERIFIED_ORDER_CLAIM'};
    if(/\b(?:tersedia|ready stock|siap dikirim|available)\b/iu.test(speech)&&(!product||product.stock===undefined||product.stock<=0))return{status:'REJECT',reasonCode:'UNVERIFIED_STOCK_CLAIM'};
    const namedProduct=speech.match(/\b(?:[Pp]roduk|[Pp]roduct)\s+([A-Z0-9][A-Za-z0-9_-]{0,39})/u)?.[0];
    if(namedProduct){
      const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('id-ID').replace(/\s+/g,' ').trim();
      const mentioned=normalize(namedProduct);const verifiedName=product?normalize(product.name):'';
      if(!product||!(mentioned===verifiedName||verifiedName.startsWith(`${mentioned} `)))return{status:'REJECT',reasonCode:'UNVERIFIED_PRODUCT_REFERENCE'};
    }
    const benefitClaim=speech.match(/\b(?:manfaat|keunggulan|fitur|benefit)\b[^.!?;]{0,90}/iu)?.[0]?.toLocaleLowerCase('id-ID');
    if(benefitClaim){const verified=product?[...product.benefits,...product.sellingPoints,...product.preferredTalkingPoints]:[];if(!verified.some(value=>value&&benefitClaim.includes(value.toLocaleLowerCase('id-ID'))))return{status:'REJECT',reasonCode:'UNVERIFIED_BENEFIT'};}
    const variantClaim=speech.match(/\b(?:varian|warna|model)\b[^.!?;]{0,80}/iu)?.[0]?.toLocaleLowerCase('id-ID');
    if(variantClaim){if(!product||!product.variants.some(value=>value&&variantClaim.includes(value.toLocaleLowerCase('id-ID'))))return{status:'REJECT',reasonCode:'UNVERIFIED_VARIANT'};}
    const specPattern=/\b(?:waterproof|tahan air|baterai|kapasitas|berat|dimensi|ukuran|terbuat dari|berbahan|kompatibel|resolusi|koneksi)\b/iu;
    if(specPattern.test(speech)){
      if(!product)return{status:'REJECT',reasonCode:'UNVERIFIED_SPECIFICATION'};
      const verified=[product.description,...product.benefits,...product.specifications,...product.variants,...product.sellingPoints,...product.preferredTalkingPoints].join(' ').toLocaleLowerCase('id-ID');
      const assertion=speech.match(/\b(?:waterproof|tahan air|baterai|kapasitas|berat|dimensi|ukuran|terbuat dari|berbahan|kompatibel|resolusi|koneksi)\b[^.!?;]{0,48}/iu)?.[0]?.toLocaleLowerCase('id-ID');
      if(!assertion||!verified.includes(assertion.trim()))return{status:'REJECT',reasonCode:'UNVERIFIED_SPECIFICATION'};
    }
    if(product){const result=this.claimPolicy.validate(speech,product);if(!result.ok)return{status:'REJECT',reasonCode:result.reason.toUpperCase()}}
    else if(/(?:Rp\s*[\d.,]+|\b(?:harga|price)\b.{0,24}\b\d+|\b(?:stok|tersedia|ready)\b.{0,24}\b\d+|\b\d+\s*(?:unit|pcs|buah|stok)\b|\b(?:diskon|promo|garansi|gratis ongkir)\b)/iu.test(speech))return{status:'REJECT',reasonCode:'UNVERIFIED_COMMERCE_CLAIM'};
    return{status:'PASS',reasonCode:'OUTPUT_VALIDATED'};
  }
}
