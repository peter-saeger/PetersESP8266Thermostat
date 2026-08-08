#include <unity.h>
#include "ThermostatLogic.h"

ThermostatLogic thermo;

void setUp(void) {
    // Re-initialize before every test
    thermo = ThermostatLogic();
    thermo.setBounds(50.0, 65.0);
    thermo.resetSmoothing(60.0);
}

void tearDown(void) {
    // clean up after each test
}

void test_initial_state(void) {
    TEST_ASSERT_EQUAL_FLOAT(60.0, thermo.getCurrentTemp());
    TEST_ASSERT_EQUAL_FLOAT(60.0, thermo.getAverageTemp());
    TEST_ASSERT_FALSE(thermo.isHeating());
}

void test_temperature_smoothing(void) {
    // Feeding 10 readings of 70 degrees should shift the average to 70 degrees
    for (int i = 0; i < ThermostatLogic::TEMP_SMOOTHING_COUNT; i++) {
        thermo.addTemperatureReading(70.0);
    }
    TEST_ASSERT_EQUAL_FLOAT(70.0, thermo.getAverageTemp());
    
    // One reading of 60 should drop it slightly: (9*70 + 60) / 10 = 69.0
    thermo.addTemperatureReading(60.0);
    TEST_ASSERT_EQUAL_FLOAT(69.0, thermo.getAverageTemp());
}

void test_hysteresis_heating_on(void) {
    // Default low bound is 50.0
    // Drop average below 50.0
    for (int i = 0; i < ThermostatLogic::TEMP_SMOOTHING_COUNT; i++) {
        thermo.addTemperatureReading(49.0);
    }
    
    bool changed = thermo.updateRelayState();
    
    TEST_ASSERT_TRUE(changed);
    TEST_ASSERT_TRUE(thermo.isHeating());
}

void test_hysteresis_heating_off(void) {
    // First, trigger heating ON
    for (int i = 0; i < ThermostatLogic::TEMP_SMOOTHING_COUNT; i++) {
        thermo.addTemperatureReading(49.0);
    }
    thermo.updateRelayState();
    TEST_ASSERT_TRUE(thermo.isHeating());
    
    // Now raise average above High Bound (65.0)
    for (int i = 0; i < ThermostatLogic::TEMP_SMOOTHING_COUNT; i++) {
        thermo.addTemperatureReading(66.0);
    }
    
    bool changed = thermo.updateRelayState();
    
    TEST_ASSERT_TRUE(changed);
    TEST_ASSERT_FALSE(thermo.isHeating());
}

void test_hysteresis_stays_on_in_deadband(void) {
    // Trigger heating ON (below 50)
    for (int i = 0; i < ThermostatLogic::TEMP_SMOOTHING_COUNT; i++) {
        thermo.addTemperatureReading(49.0);
    }
    thermo.updateRelayState();
    
    // Raise temp to 60.0 (inside deadband, 50 to 65). Should remain ON.
    for (int i = 0; i < ThermostatLogic::TEMP_SMOOTHING_COUNT; i++) {
        thermo.addTemperatureReading(60.0);
    }
    bool changed = thermo.updateRelayState();
    
    TEST_ASSERT_FALSE(changed);
    TEST_ASSERT_TRUE(thermo.isHeating());
}

void test_set_bounds_validation(void) {
    // Try to set invalid bounds (low > high)
    thermo.setBounds(80.0, 60.0);
    
    // Should retain previous valid bounds
    TEST_ASSERT_EQUAL_FLOAT(50.0, thermo.getLowBound());
    TEST_ASSERT_EQUAL_FLOAT(65.0, thermo.getHighBound());
}

int main(int argc, char **argv) {
    UNITY_BEGIN();
    RUN_TEST(test_initial_state);
    RUN_TEST(test_temperature_smoothing);
    RUN_TEST(test_hysteresis_heating_on);
    RUN_TEST(test_hysteresis_heating_off);
    RUN_TEST(test_hysteresis_stays_on_in_deadband);
    RUN_TEST(test_set_bounds_validation);
    return UNITY_END();
}
