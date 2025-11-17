interface EchoParameters {
  message?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

interface EchoResult {
  echoed: Record<string, any>;
  metadata?: Record<string, any> | null;
}

export function execute(parameters: EchoParameters): EchoResult {
  const { metadata, ...rest } = parameters;
  
  return {
    echoed: rest,
    metadata: metadata ?? null
  };
}

export default execute;

