import { z } from 'zod';

/**
 * Plugin initialization function
 * This function is called when the plugin is loaded
 */
export async function initialize(api) {
  api.logger.info('Initializing example tool plugin');

  // Register a custom tool
  api.registerTool({
    name: 'get_weather',
    description: 'Get the current weather for a city',
    schema: z.object({
      city: z.string().describe('The city name'),
      units: z.enum(['celsius', 'fahrenheit']).optional().describe('Temperature units'),
    }),
    executor: async (args) => {
      // In a real plugin, this would call a weather API
      api.logger.info(`Getting weather for ${args.city}`);
      
      return {
        city: args.city,
        temperature: 22,
        units: args.units || 'celsius',
        condition: 'sunny',
        humidity: 65,
      };
    },
  });

  // Register another tool
  api.registerTool({
    name: 'calculate',
    description: 'Perform basic mathematical calculations',
    schema: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('The operation to perform'),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    }),
    executor: async (args) => {
      api.logger.info(`Calculating: ${args.a} ${args.operation} ${args.b}`);
      
      let result;
      switch (args.operation) {
        case 'add':
          result = args.a + args.b;
          break;
        case 'subtract':
          result = args.a - args.b;
          break;
        case 'multiply':
          result = args.a * args.b;
          break;
        case 'divide':
          if (args.b === 0) {
            throw new Error('Division by zero');
          }
          result = args.a / args.b;
          break;
      }
      
      return {
        operation: args.operation,
        a: args.a,
        b: args.b,
        result,
      };
    },
  });

  api.logger.info('Example tool plugin initialized successfully');
}
