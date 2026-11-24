#import "KesshoAudioUnit.h"
#import <CoreAudioKit/AUViewController.h>

#include <math.h>

@interface KesshoParameterSlider : NSSlider
@property(nonatomic, strong) AUParameter* parameter;
@property(nonatomic, getter=isTracking) BOOL tracking;
@property(nonatomic) AUValue displayedValue;
@end

@implementation KesshoParameterSlider

- (void)mouseDown:(NSEvent*)event {
  self.tracking = YES;
  [self.parameter setValue:self.floatValue originator:nil atHostTime:0
                 eventType:AUParameterAutomationEventTypeTouch];
  [super mouseDown:event];
  [self.parameter setValue:self.floatValue originator:nil atHostTime:0
                 eventType:AUParameterAutomationEventTypeRelease];
  self.tracking = NO;
}

@end

@interface KesshoAudioUnitViewController : AUViewController <AUAudioUnitFactory>
@property(atomic, strong) KesshoAudioUnit* unit;
@end

static NSTextField* label(NSString* text, NSFont* font, NSColor* color) {
  NSTextField* field = [NSTextField labelWithString:text];
  field.font = font;
  field.textColor = color;
  return field;
}

static NSStackView* row(NSArray<NSView*>* views) {
  NSStackView* stack = [NSStackView stackViewWithViews:views];
  stack.orientation = NSUserInterfaceLayoutOrientationHorizontal;
  stack.alignment = NSLayoutAttributeCenterY;
  stack.spacing = 12;
  return stack;
}

@implementation KesshoAudioUnitViewController {
  AUParameterTree* _tree;
  NSMutableDictionary<NSNumber*, NSControl*>* _controls;
  NSMutableDictionary<NSNumber*, NSTextField*>* _readouts;
  NSTimer* _refreshTimer;
}

- (AUAudioUnit*)createAudioUnitWithComponentDescription:(AudioComponentDescription)description
                                                  error:(NSError**)error {
  KesshoAudioUnit* unit = [[KesshoAudioUnit alloc] initWithComponentDescription:description options:0 error:error];
  self.unit = unit;
  __weak KesshoAudioUnitViewController* weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    [weakSelf buildControlsIfReady];
  });
  return unit;
}

- (void)loadView {
  self.preferredContentSize = NSMakeSize(500, 416);
  self.view = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 500, 416)];
  [self buildControlsIfReady];
}

- (void)viewWillAppear {
  [super viewWillAppear];
  [self refreshControls];
  [_refreshTimer invalidate];
  __weak KesshoAudioUnitViewController* weakSelf = self;
  // Refresh on the UI thread so MIDI and scheduled automation need no UI callbacks during render.
  _refreshTimer = [NSTimer scheduledTimerWithTimeInterval:1.0 / 15.0 repeats:YES block:^(NSTimer* timer) {
    (void)timer;
    [weakSelf refreshControls];
  }];
  _refreshTimer.tolerance = 0.02;
}

- (void)viewDidDisappear {
  [_refreshTimer invalidate];
  _refreshTimer = nil;
  [super viewDidDisappear];
}

- (void)dealloc {
  [_refreshTimer invalidate];
}

- (void)bindControl:(NSControl*)control parameter:(AUParameter*)parameter {
  control.tag = (NSInteger)parameter.address;
  control.target = self;
  control.action = @selector(parameterChanged:);
  control.accessibilityLabel = parameter.displayName;
  _controls[@(parameter.address)] = control;
}

- (NSButton*)checkboxForAddress:(AUParameterAddress)address title:(NSString*)title {
  NSButton* button = [NSButton checkboxWithTitle:title target:nil action:NULL];
  [self bindControl:button parameter:[_tree parameterWithAddress:address]];
  return button;
}

- (void)buildControlsIfReady {
  if (!self.isViewLoaded || _tree != nil) return;
  _tree = self.unit.parameterTree;
  if (_tree == nil) return;
  _controls = [NSMutableDictionary dictionary];
  _readouts = [NSMutableDictionary dictionary];

  NSTextField* title = label(@"Kessho", [NSFont systemFontOfSize:28 weight:NSFontWeightSemibold],
                             NSColor.labelColor);
  NSTextField* subtitle = label(@"GENERATIVE INSTRUMENT", [NSFont systemFontOfSize:11 weight:NSFontWeightSemibold],
                                NSColor.secondaryLabelColor);

  AUParameter* targetParameter = [_tree parameterWithAddress:KesshoParameterMidiTarget];
  NSPopUpButton* target = [[NSPopUpButton alloc] initWithFrame:NSZeroRect pullsDown:NO];
  [target addItemsWithTitles:targetParameter.valueStrings];
  for (NSInteger index = 0; index < target.numberOfItems; ++index) {
    [target itemAtIndex:index].tag = (NSInteger)targetParameter.minValue + index;
  }
  [self bindControl:target parameter:targetParameter];
  NSStackView* input = row(@[
    [NSTextField labelWithString:@"MIDI Target"], target,
    [self checkboxForAddress:KesshoParameterHostSync title:@"Sync to Host"]
  ]);
  NSStackView* patterns = row(@[
    [self checkboxForAddress:KesshoParameterPadPattern title:@"Pad Pattern"],
    [self checkboxForAddress:KesshoParameterDrumPattern title:@"Drum Pattern"]
  ]);

  NSMutableArray<NSArray<NSView*>*>* mixerRows = [NSMutableArray array];
  for (AUParameter* parameter in _tree.allParameters) {
    if (parameter.unit == kAudioUnitParameterUnit_Boolean ||
        parameter.unit == kAudioUnitParameterUnit_Indexed) continue;

    KesshoParameterSlider* slider = [[KesshoParameterSlider alloc] initWithFrame:NSZeroRect];
    slider.parameter = parameter;
    slider.displayedValue = NAN;
    slider.minValue = parameter.minValue;
    slider.maxValue = parameter.maxValue;
    slider.continuous = YES;
    [slider.widthAnchor constraintGreaterThanOrEqualToConstant:220].active = YES;
    [self bindControl:slider parameter:parameter];

    NSTextField* readout = label(@"", [NSFont monospacedDigitSystemFontOfSize:11 weight:NSFontWeightRegular],
                                 NSColor.secondaryLabelColor);
    readout.alignment = NSTextAlignmentRight;
    [readout.widthAnchor constraintEqualToConstant:56].active = YES;
    _readouts[@(parameter.address)] = readout;
    [mixerRows addObject:@[[NSTextField labelWithString:parameter.displayName], slider, readout]];
  }
  NSGridView* mixer = [NSGridView gridViewWithViews:mixerRows];
  mixer.rowSpacing = 6;
  mixer.columnSpacing = 12;
  [mixer columnAtIndex:0].xPlacement = NSGridCellPlacementLeading;
  [mixer columnAtIndex:1].xPlacement = NSGridCellPlacementFill;

  NSBox* divider = [[NSBox alloc] initWithFrame:NSZeroRect];
  divider.boxType = NSBoxSeparator;
  NSTextField* hint = label(@"MIDI CC 20–25: Master and source levels   ·   CC 91: Reverb",
                            [NSFont systemFontOfSize:11], NSColor.secondaryLabelColor);
  NSStackView* layout = [NSStackView stackViewWithViews:@[title, subtitle, input, patterns, divider, mixer, hint]];
  layout.orientation = NSUserInterfaceLayoutOrientationVertical;
  layout.alignment = NSLayoutAttributeLeading;
  layout.spacing = 10;
  [layout setCustomSpacing:3 afterView:title];
  [layout setCustomSpacing:18 afterView:subtitle];
  layout.translatesAutoresizingMaskIntoConstraints = NO;
  [self.view addSubview:layout];
  [NSLayoutConstraint activateConstraints:@[
    [layout.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:22],
    [layout.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-22],
    [layout.topAnchor constraintEqualToAnchor:self.view.topAnchor constant:20],
    [mixer.widthAnchor constraintEqualToAnchor:layout.widthAnchor],
    [divider.widthAnchor constraintEqualToAnchor:layout.widthAnchor],
  ]];
  [self refreshControls];
}

- (void)parameterChanged:(NSControl*)sender {
  AUParameter* parameter = [_tree parameterWithAddress:(AUParameterAddress)sender.tag];
  if (parameter.unit == kAudioUnitParameterUnit_Indexed) {
    parameter.value = (AUValue)[(NSPopUpButton*)sender selectedTag];
  } else if (parameter.unit == kAudioUnitParameterUnit_Boolean) {
    parameter.value = [(NSButton*)sender state] == NSControlStateValueOn ? 1.0f : 0.0f;
  } else {
    parameter.value = sender.floatValue;
  }
  [self refreshControls];
}

- (void)refreshControls {
  for (NSNumber* address in _controls) {
    AUParameter* parameter = [_tree parameterWithAddress:address.unsignedLongLongValue];
    const AUValue value = parameter.value;
    NSControl* control = _controls[address];
    if (parameter.unit == kAudioUnitParameterUnit_Indexed) {
      NSPopUpButton* menu = (NSPopUpButton*)control;
      if (menu.selectedTag != (NSInteger)value) [menu selectItemWithTag:(NSInteger)value];
    } else if (parameter.unit == kAudioUnitParameterUnit_Boolean) {
      NSButton* button = (NSButton*)control;
      const NSControlStateValue state = value != 0.0f ? NSControlStateValueOn : NSControlStateValueOff;
      if (button.state != state) button.state = state;
    } else {
      KesshoParameterSlider* slider = (KesshoParameterSlider*)control;
      if (!slider.isTracking && slider.floatValue != value) slider.floatValue = value;
      if (slider.displayedValue == value) continue;
      slider.displayedValue = value;
      _readouts[address].stringValue = parameter.unit == kAudioUnitParameterUnit_LinearGain
          ? (value > 0.0f ? [NSString stringWithFormat:@"%.1f dB", 20.0 * log10(value)] : @"−∞ dB")
          : [NSString stringWithFormat:@"%.0f%%", value * 100.0f];
    }
  }
}

@end

