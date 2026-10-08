package com.richangyu.lifeworkbench;
import org.junit.Test;
import java.util.TimeZone;
import static org.junit.Assert.*;

public class WorkbenchNutritionPolicyTest {
    @Test public void mealFormRejectsPhotoCredentialsAndActions() {
        for (String value : new String[]{"mealType","eatenAt","note","calories","proteinG","carbsG","fatG"}) {
            assertTrue(WorkbenchNutritionPolicy.allowsMealField(value));
        }
        for (String value : new String[]{"photo","action","url","origin","apiKey","ownerUserId","__proto__",""}) {
            assertFalse(WorkbenchNutritionPolicy.allowsMealField(value));
        }
    }
    @Test public void responseMustBeExactBoundOriginAndNutritionPath() {
        assertTrue(WorkbenchNutritionPolicy.expectedResponse("https://example.com/api/nutrition","https://example.com"));
        assertTrue(WorkbenchNutritionPolicy.expectedResponse("https://example.com:443/api/nutrition","https://example.com"));
        for(String value:new String[]{"https://attacker.test/api/nutrition","http://example.com/api/nutrition",
            "https://example.com/api/mobile","https://example.com/api/nutrition/","https://example.com/api/nutrition?x=1",
            "https://example.com/api/nutrition#x","https://user:pass@example.com/api/nutrition",
            "https://example.com:8443/api/nutrition","https://example.com/api/%6eutrition","not-url"}) {
            assertFalse(value,WorkbenchNutritionPolicy.expectedResponse(value,"https://example.com"));
        }
    }
    @Test public void nonJsonResponsesCannotBecomeSnapshots() {
        assertTrue(WorkbenchNutritionPolicy.jsonType("application/json; charset=utf-8"));
        assertTrue(WorkbenchNutritionPolicy.jsonType("Application/JSON"));
        for(String value:new String[]{"text/html","text/plain","","application/jsonp"}) {
            assertFalse(WorkbenchNutritionPolicy.jsonType(value));
        }
        assertFalse(WorkbenchNutritionPolicy.jsonType(null));
    }
    @Test public void numericFieldsRejectNonfiniteNegativeAndAmbiguousValues() {
        for(String value:new String[]{"NaN","Infinity","-1","1e3","1,000","10 kcal","","+1","999999999999999999999999999999999999"}) {
            try{WorkbenchNutritionPolicy.number(value,0,100000,false);fail(value);}
            catch(IllegalArgumentException expected){}
        }
        assertEquals(123.5,WorkbenchNutritionPolicy.number("123.5",0,100000,false),0.001);
        assertEquals(0,WorkbenchNutritionPolicy.number("",0,100000,true),0.001);
    }
    @Test public void zeroCannotSilentlyInvokeTextEstimationForManualMeal() {
        try{WorkbenchNutritionPolicy.number("0",Double.MIN_NORMAL,100000,false);fail();}
        catch(IllegalArgumentException expected){}
        assertEquals(0,WorkbenchNutritionPolicy.number("0",0,100000,false),0.001);
    }
    @Test public void targetRangesMatchExistingServerLimits() {
        assertEquals(800,WorkbenchNutritionPolicy.number("800",800,6000,false),0.001);
        assertEquals(6000,WorkbenchNutritionPolicy.number("6000",800,6000,false),0.001);
        for(String value:new String[]{"799","6001"}) {
            try{WorkbenchNutritionPolicy.number(value,800,6000,false);fail();}
            catch(IllegalArgumentException expected){}
        }
    }
    @Test public void utcRecordsUseDeviceDayIncludingChinaMidnight() {
        TimeZone zone=TimeZone.getTimeZone("Asia/Shanghai");
        assertEquals("2026-10-06",WorkbenchNutritionPolicy.dayKey("2026-10-05T16:00:00.000Z",zone));
        assertEquals("2026-10-05",WorkbenchNutritionPolicy.dayKey("2026-10-05T15:59:59.000Z",zone));
        assertEquals("2026-10-06",WorkbenchNutritionPolicy.dayKey("2026-10-06T00:00:00+08:00",zone));
        assertEquals("2026-10-05",WorkbenchNutritionPolicy.dayKey("2026-10-05T16:00:00Z",TimeZone.getTimeZone("UTC")));
    }
    @Test public void invalidDatesDoNotBecomeTodaysIntake() {
        for(String value:new String[]{"not-date","2026-02-30T00:00:00.000Z","2026-10-06T24:00:00.000Z","2026-10-06"}) {
            assertNull(value,WorkbenchNutritionPolicy.instant(value));
        }
        assertNotNull(WorkbenchNutritionPolicy.instant("2024-02-29T00:00:00.000Z"));
        assertEquals("",WorkbenchNutritionPolicy.dayKey("not-date",TimeZone.getTimeZone("UTC")));
    }
    @Test public void metricsRejectBrokenNegativeAndInfiniteValues() {
        assertTrue(WorkbenchNutritionPolicy.validMetric(0));
        assertTrue(WorkbenchNutritionPolicy.validMetric(2300.5));
        assertFalse(WorkbenchNutritionPolicy.validMetric(Double.NaN));
        assertFalse(WorkbenchNutritionPolicy.validMetric(Double.POSITIVE_INFINITY));
        assertFalse(WorkbenchNutritionPolicy.validMetric(-1));
    }

    @Test public void portionsScaleTogetherAndRejectUnsafeFactors() {
        assertEquals(150,WorkbenchNutritionPolicy.scaledNumber(100,1.5),0.001);
        assertEquals(2.3,WorkbenchNutritionPolicy.scaledNumber(1.5,1.5),0.001);
        for(double factor:new double[]{0,0.01,21,Double.NaN,Double.POSITIVE_INFINITY}) {
            try {WorkbenchNutritionPolicy.scaledNumber(100,factor);fail();}
            catch(IllegalArgumentException expected){}
        }
    }
}
