/**
 * @jest-environment jsdom
 */

describe('HostChannel', () => {
  let HostChannel;
  let mockFrame;
  let mockPostMessage;

  beforeEach(() => {
    // Reset the module before each test
    jest.resetModules();

    // Mock the iframe element
    mockPostMessage = jest.fn();
    mockFrame = {
      contentWindow: {
        postMessage: mockPostMessage,
      },
    };

    // Mock document.querySelector to return our mock frame
    document.querySelector = jest.fn(() => mockFrame);

    // Mock MessageChannel
    global.MessageChannel = jest.fn(function () {
      this.port1 = {
        onmessage: null,
        onmessageerror: null,
        postMessage: jest.fn(),
        start: jest.fn(),
        close: jest.fn(),
      };
      this.port2 = {
        onmessage: null,
        onmessageerror: null,
        postMessage: jest.fn(),
        start: jest.fn(),
        close: jest.fn(),
      };
    });

    // Require the HostChannel class
    HostChannel =
      require('../HostChannel.ts').default || require('../HostChannel.ts');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a HostChannel instance successfully', () => {
      const channel = new HostChannel('http://example.com', '#test-frame');

      expect(channel).toBeDefined();
      expect(channel.channelType).toBe('MessageChannel');
      expect(channel.channelInstance).toBeDefined();
      expect(channel.frame).toBe(mockFrame);
    });

    it('should query the DOM for the frame element', () => {
      new HostChannel('http://example.com', '#test-frame');

      expect(document.querySelector).toHaveBeenCalledWith('#test-frame');
    });

    it('should throw an error if frame element is not found', () => {
      document.querySelector = jest.fn(() => null);

      expect(() => {
        new HostChannel('http://example.com', '#missing-frame');
      }).toThrow('iFrame cannot be found using #missing-frame');
    });

    it('should create a new MessageChannel', () => {
      new HostChannel('http://example.com', '#test-frame');

      expect(global.MessageChannel).toHaveBeenCalled();
    });

    it('should post a Host:Create message to the frame', () => {
      const channel = new HostChannel('http://example.com', '#test-frame');

      expect(mockPostMessage).toHaveBeenCalledWith(
        { event: 'Host:Create' },
        window.location.origin,
        [channel.channelInstance.port2],
      );
    });

    it('should set up message event handlers', () => {
      const channel = new HostChannel('http://example.com', '#test-frame');

      expect(channel.channelInstance.port1.onmessage).toBeDefined();
      expect(channel.channelInstance.port1.onmessageerror).toBeDefined();
    });
  });

  describe('recieveMessageFromFrame', () => {
    it('should log the event when receiving a message', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const channel = new HostChannel('http://example.com', '#test-frame');
      const mockEvent = { data: 'test message' };

      channel.recieveMessageFromFrame(mockEvent);

      expect(consoleSpy).toHaveBeenCalledWith(mockEvent);
      consoleSpy.mockRestore();
    });
  });

  describe('recieveMessageError', () => {
    it('should log error when receiving a message error', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const channel = new HostChannel('http://example.com', '#test-frame');
      const mockEvent = { error: 'test error' };

      channel.recieveMessageError(mockEvent);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'HostChannel reports error from FrameChannel:',
        mockEvent,
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('broadcastMessage', () => {
    it('should post a message through port1', () => {
      const channel = new HostChannel('http://example.com', '#test-frame');
      const testMessage = { action: 'test', data: 'hello' };

      channel.broadcastMessage(testMessage);

      expect(channel.channelInstance.port1.postMessage).toHaveBeenCalledWith(
        testMessage,
      );
    });

    it('should handle multiple broadcast messages', () => {
      const channel = new HostChannel('http://example.com', '#test-frame');
      const message1 = { action: 'action1' };
      const message2 = { action: 'action2' };

      channel.broadcastMessage(message1);
      channel.broadcastMessage(message2);

      expect(channel.channelInstance.port1.postMessage).toHaveBeenCalledTimes(
        2,
      );
      expect(channel.channelInstance.port1.postMessage).toHaveBeenNthCalledWith(
        1,
        message1,
      );
      expect(channel.channelInstance.port1.postMessage).toHaveBeenNthCalledWith(
        2,
        message2,
      );
    });
  });

  describe('message handler integration', () => {
    it('should call recieveMessageFromFrame when port1 receives a message', () => {
      const channel = new HostChannel('http://example.com', '#test-frame');
      const spy = jest.spyOn(channel, 'recieveMessageFromFrame');
      const mockEvent = { data: 'test' };

      // Simulate message event
      channel.channelInstance.port1.onmessage(mockEvent);

      expect(spy).toHaveBeenCalledWith(mockEvent);
    });
  });
});
