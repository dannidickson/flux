/**
 * @jest-environment jsdom
 */

describe('FrameChannel', () => {
  let FrameChannel;
  let mockAddEventListener;
  let mockRemoveEventListener;

  beforeEach(() => {
    // Reset the module before each test
    jest.resetModules();

    // Store original methods
    mockAddEventListener = jest.fn();
    mockRemoveEventListener = jest.fn();

    // Mock window.addEventListener and removeEventListener
    window.addEventListener = mockAddEventListener;
    window.removeEventListener = mockRemoveEventListener;

    // Set window.location.origin for tests
    delete window.location;
    window.location = { origin: 'http://localhost:3000' };

    // Require the FrameChannel class
    FrameChannel =
      require('../FrameChannel.ts').default || require('../FrameChannel.ts');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a FrameChannel instance successfully', () => {
      const channel = new FrameChannel('http://example.com', '#test-frame');

      expect(channel).toBeDefined();
      expect(channel.channel).toBeUndefined();
    });

    it('should add a message event listener on construction', () => {
      new FrameChannel('http://example.com', '#test-frame');

      expect(mockAddEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
    });
  });

  describe('handleInitialPortSetup', () => {
    let channel;
    let mockPort;

    beforeEach(() => {
      mockPort = {
        onmessage: null,
        postMessage: jest.fn(),
        start: jest.fn(),
        close: jest.fn(),
      };
    });

    it('should throw an error if origins do not match', () => {
      channel = new FrameChannel('http://example.com', '#test-frame');

      const event = {
        origin: 'http://malicious-site.com',
        data: { action: 'Host:Create' },
        ports: [mockPort],
      };

      expect(() => {
        channel.handleInitialPortSetup(event);
      }).toThrow('Location origins do not match');
    });

    it('should setup channel when Host:Create action is received', () => {
      channel = new FrameChannel('http://example.com', '#test-frame');

      const event = {
        origin: 'http://localhost:3000',
        data: { action: 'Host:Create' },
        ports: [mockPort],
      };

      channel.handleInitialPortSetup(event);

      expect(channel.channel).toBe(mockPort);
      expect(mockPort.onmessage).toBeDefined();
    });

    it('should set up message handler on the port', () => {
      channel = new FrameChannel('http://example.com', '#test-frame');

      const event = {
        origin: 'http://localhost:3000',
        data: { action: 'Host:Create' },
        ports: [mockPort],
      };

      channel.handleInitialPortSetup(event);

      expect(typeof mockPort.onmessage).toBe('function');
    });

    it('should remove event listener after setup', () => {
      channel = new FrameChannel('http://example.com', '#test-frame');

      const event = {
        origin: 'http://localhost:3000',
        data: { action: 'Host:Create' },
        ports: [mockPort],
      };

      channel.handleInitialPortSetup(event);

      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
    });

    it('should not setup channel if action is not Host:Create', () => {
      channel = new FrameChannel('http://example.com', '#test-frame');

      const event = {
        origin: 'http://localhost:3000',
        data: { action: 'SomeOtherAction' },
        ports: [mockPort],
      };

      channel.handleInitialPortSetup(event);

      expect(channel.channel).toBeUndefined();
      expect(mockRemoveEventListener).not.toHaveBeenCalled();
    });

    it('should handle event with correct origin but no action', () => {
      channel = new FrameChannel('http://example.com', '#test-frame');

      const event = {
        origin: 'http://localhost:3000',
        data: {},
        ports: [mockPort],
      };

      channel.handleInitialPortSetup(event);

      expect(channel.channel).toBeUndefined();
    });
  });

  describe('recievedMessage', () => {
    it('should log the received message', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const channel = new FrameChannel('http://example.com', '#test-frame');
      const mockMessage = { data: 'test message' };

      channel.recievedMessage(mockMessage);

      expect(consoleSpy).toHaveBeenCalledWith(mockMessage);
      consoleSpy.mockRestore();
    });

    it('should handle different message types', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const channel = new FrameChannel('http://example.com', '#test-frame');

      const message1 = { action: 'test1', data: { value: 1 } };
      const message2 = { action: 'test2', data: { value: 2 } };

      channel.recievedMessage(message1);
      channel.recievedMessage(message2);

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenNthCalledWith(1, message1);
      expect(consoleSpy).toHaveBeenNthCalledWith(2, message2);

      consoleSpy.mockRestore();
    });
  });

  describe('integration tests', () => {
    it('should handle the complete message flow', () => {
      const channel = new FrameChannel('http://example.com', '#test-frame');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const mockPort = {
        onmessage: null,
        postMessage: jest.fn(),
      };

      // Simulate receiving the initial setup message
      const setupEvent = {
        origin: 'http://localhost:3000',
        data: { action: 'Host:Create' },
        ports: [mockPort],
      };

      channel.handleInitialPortSetup(setupEvent);

      // Simulate receiving a message through the port
      const dataMessage = { data: 'Hello from host' };
      mockPort.onmessage(dataMessage);

      expect(consoleSpy).toHaveBeenCalledWith(dataMessage);
      expect(channel.channel).toBe(mockPort);

      consoleSpy.mockRestore();
    });

    it('should reject messages from different origins', () => {
      const channel = new FrameChannel('http://example.com', '#test-frame');

      const event = {
        origin: 'http://evil-site.com',
        data: { action: 'Host:Create' },
        ports: [{ onmessage: null }],
      };

      expect(() => {
        channel.handleInitialPortSetup(event);
      }).toThrow('Location origins do not match');

      expect(channel.channel).toBeUndefined();
    });
  });
});
