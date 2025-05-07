declare module '@neardefi/shade-agent-js' {
  export const networkId: string;
  
  export function deriveWorkerAccount(): Promise<string>;
  
  export function registerWorker(): Promise<boolean>;
  
  export function contractCall(options: {
    accountId?: string;
    methodName: string;
    args: Record<string, any>;
  }): Promise<any>;
  
  export function generateAddress(options: {
    publicKey: string;
    accountId: string;
    path: string;
    chain: string;
  }): Promise<{ address: string }>;
  
  export function setContractId(contractId: string): void;
  
  export function setKey(signerId: string, secretKey: string): void;
  
  export class TappdClient {
    constructor(endpoint?: string);
    getInfo(): Promise<{ tcb_info: string }>;
  }
}
