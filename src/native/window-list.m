#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>

int main(void) {
  @autoreleasepool {
    CFArrayRef rawWindows = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID
    );
    if (rawWindows == NULL) return 1;

    NSArray<NSDictionary *> *windows = CFBridgingRelease(rawWindows);
    NSMutableArray<NSDictionary *> *result = [NSMutableArray array];
    for (NSDictionary *window in windows) {
      NSNumber *ownerPid = window[(__bridge NSString *)kCGWindowOwnerPID];
      NSNumber *layer = window[(__bridge NSString *)kCGWindowLayer];
      NSNumber *alpha = window[(__bridge NSString *)kCGWindowAlpha];
      NSDictionary *bounds = window[(__bridge NSString *)kCGWindowBounds];
      CGRect frame;
      if (ownerPid == nil || layer == nil || alpha == nil || bounds == nil ||
          !CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)bounds, &frame)) continue;

      NSRunningApplication *owner = [NSRunningApplication runningApplicationWithProcessIdentifier:ownerPid.intValue];
      NSString *name = owner.localizedName;
      NSString *bundleId = owner.bundleIdentifier;
      if (name == nil || bundleId == nil) continue;

      [result addObject:@{
        @"ownerPid": ownerPid,
        @"layer": layer,
        @"alpha": alpha,
        @"bounds": @{
          @"x": @(frame.origin.x),
          @"y": @(frame.origin.y),
          @"width": @(frame.size.width),
          @"height": @(frame.size.height)
        },
        @"appName": name,
        @"bundleId": bundleId
      }];
      if (result.count >= 512) break;
    }

    NSError *error = nil;
    NSData *json = [NSJSONSerialization dataWithJSONObject:result options:0 error:&error];
    if (json == nil || error != nil) return 1;
    fwrite(json.bytes, 1, json.length, stdout);
    fputc('\n', stdout);
  }
  return 0;
}
