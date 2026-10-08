package com.richangyu.lifeworkbench;
import org.junit.Test;
import static org.junit.Assert.*;
public class WorkbenchOperationPolicyTest {
 @Test public void responseMustMatchExactOriginAndPath() {
  assertTrue(WorkbenchOperationPolicy.expectedResponse("https://example.com/api/mobile-actions","https://example.com"));
  for(String url:new String[]{"https://attacker.test/api/mobile-actions","http://example.com/api/mobile-actions","https://example.com/api/mobile","https://example.com/api/mobile-actions?x=1","https://example.com/api/mobile-actions#x","https://user@example.com/api/mobile-actions","https://example.com/api/mobile-actions/","not-url"})
   assertFalse(url,WorkbenchOperationPolicy.expectedResponse(url,"https://example.com"));
 }
 @Test public void draftsAndTemplatesArePartitionedByAccountAndOrigin() {
  String a=WorkbenchOperationPolicy.scope("https://example.com","alice");
  assertEquals(64,a.length());assertEquals(a,WorkbenchOperationPolicy.scope("https://EXAMPLE.com/","alice"));
  assertNotEquals(a,WorkbenchOperationPolicy.scope("https://example.com","bob"));
  assertNotEquals(a,WorkbenchOperationPolicy.scope("https://another.test","alice"));
  assertEquals("",WorkbenchOperationPolicy.scope("http://example.com","alice"));
  assertEquals("",WorkbenchOperationPolicy.scope("https://example.com",""));
 }
 @Test public void moneyHasStrictTwoDecimalBounds() {
  assertEquals(0.01,WorkbenchOperationPolicy.money("0.01"),0.001);
  assertEquals("10.00",WorkbenchOperationPolicy.moneyLabel(10));
  for(String input:new String[]{"NaN","Infinity","-1","1e3","1.234","100000001","10 yuan",""}) {
   try {WorkbenchOperationPolicy.money(input);fail(input);}catch(IllegalArgumentException expected){}
  }
 }
 @Test public void estimatesAreNotFinancialReceipts() {
  assertEquals(60,WorkbenchOperationPolicy.expected("\u6309\u5c0f\u65f6",60,60),0.001);
  assertEquals(30,WorkbenchOperationPolicy.expected("\u6309\u5c0f\u65f6",60,30),0.001);
  assertEquals(50,WorkbenchOperationPolicy.expected("\u6309\u6b21",50,30),0.001);
  assertFalse(WorkbenchOperationPolicy.draftAction("receivable.receive"));
  assertFalse(WorkbenchOperationPolicy.draftAction("work.finish"));
  assertTrue(WorkbenchOperationPolicy.draftAction("event.create"));
  assertTrue(WorkbenchOperationPolicy.draftAction("schedule.create"));
  assertTrue(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-actions",true));
  assertFalse(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-actions?owner=bob",true));
 }
}
