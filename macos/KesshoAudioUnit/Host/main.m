#import <Cocoa/Cocoa.h>

@interface KesshoAppDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSWindow* window;
@end

@implementation KesshoAppDelegate

- (void)applicationDidFinishLaunching:(NSNotification*)notification {
  (void)notification;
  NSRect frame = NSMakeRect(0, 0, 520, 220);
  self.window = [[NSWindow alloc]
      initWithContentRect:frame
                styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
                  backing:NSBackingStoreBuffered
                    defer:NO];
  self.window.title = @"Kessho Audio Unit";
  [self.window center];

  NSTextField* label = [[NSTextField alloc] initWithFrame:NSMakeRect(40, 75, 440, 70)];
  label.stringValue = @"Kessho is installed as an Audio Unit instrument.\nOpen Logic Pro and choose Kessho › Kessho.";
  label.alignment = NSTextAlignmentCenter;
  label.editable = NO;
  label.selectable = NO;
  label.bordered = NO;
  label.drawsBackground = NO;
  label.font = [NSFont systemFontOfSize:16.0];
  [self.window.contentView addSubview:label];
  [self.window makeKeyAndOrderFront:nil];
  [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication*)sender {
  (void)sender;
  return YES;
}

@end

int main(int argc, const char* argv[]) {
  (void)argc;
  (void)argv;
  @autoreleasepool {
    NSApplication* app = [NSApplication sharedApplication];
    KesshoAppDelegate* delegate = [KesshoAppDelegate new];
    app.delegate = delegate;
    [app run];
  }
  return 0;
}

