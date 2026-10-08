package com.richangyu.lifeworkbench;
import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;
public class NativeFeatureCatalogTest {
 @Test public void nativeNutritionWorkAndDraftsAreDiscoverable() {
  for(String query:new String[]{"\u70ed\u91cf","\u517c\u804c \u5de5\u65f6","\u672c\u673a \u8349\u7a3f","\u5e94\u6536 \u7ed3\u7b97"}) {
   List<NativeFeatureCatalog.Entry> matches=NativeFeatureCatalog.search(query,NativeFeatureCatalog.Scope.NATIVE);
   assertFalse(query,matches.isEmpty());for(NativeFeatureCatalog.Entry entry:matches)assertTrue(entry.nativeInApp);
  }
 }
 @Test public void webOnlyFeaturesAreLabelledHonestly() {
  List<NativeFeatureCatalog.Entry> matches=NativeFeatureCatalog.search("\u5b8c\u6574\u6536\u652f",NativeFeatureCatalog.Scope.WEB);
  assertFalse(matches.isEmpty());for(NativeFeatureCatalog.Entry entry:matches)assertFalse(entry.nativeInApp);
  assertTrue(NativeFeatureCatalog.search("\u76f8\u518c",NativeFeatureCatalog.Scope.NATIVE).isEmpty());
 }
 @Test public void searchRequiresEveryTermAndDoesNotMutateTheCatalog() {
  assertTrue(NativeFeatureCatalog.search("\u70ed\u91cf \u4e0d\u5b58\u5728",NativeFeatureCatalog.Scope.ALL).isEmpty());
  int size=NativeFeatureCatalog.search("",NativeFeatureCatalog.Scope.ALL).size();
  assertEquals(size,NativeFeatureCatalog.search(null,NativeFeatureCatalog.Scope.ALL).size());
 }
}
