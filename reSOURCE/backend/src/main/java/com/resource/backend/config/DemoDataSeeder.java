package com.resource.backend.config;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.AreaUnit;
import com.resource.backend.entity.Facility;
import com.resource.backend.entity.Material;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;
import com.resource.backend.entity.Role;
import com.resource.backend.entity.Space;
import com.resource.backend.entity.SpacePricing;
import com.resource.backend.entity.SpaceStatus;
import com.resource.backend.entity.User;
import com.resource.backend.repository.MaterialRepository;
import com.resource.backend.repository.SpaceRepository;
import com.resource.backend.repository.UserRepository;

/**
 * Development only demo data.
 *
 * <p>Disabled unless {@code SEED_DEMO_DATA=true}. It creates a demo owner and a
 * handful of example listings in both marketplaces so they can be explored
 * immediately; nothing is seeded in a normal run.</p>
 */
@Configuration
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true")
public class DemoDataSeeder {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    @Bean
    ApplicationRunner seedDemoSpaces(
            UserRepository userRepository,
            SpaceRepository spaceRepository,
            MaterialRepository materialRepository,
            PasswordEncoder passwordEncoder,
            org.springframework.core.env.Environment environment) {

        return arguments -> seed(userRepository, spaceRepository, materialRepository,
                passwordEncoder, environment);
    }

    @Transactional
    void seed(UserRepository userRepository,
              SpaceRepository spaceRepository,
              MaterialRepository materialRepository,
              PasswordEncoder passwordEncoder,
              org.springframework.core.env.Environment environment) {

        String email = environment.getProperty("app.seed.owner-email", "demo@resource.local");
        String password = environment.getProperty("app.seed.owner-password", "DemoPass123");

        User owner = userRepository.findByEmailIgnoreCase(email).orElseGet(() -> {
            User demo = new User("reSOURCE Demo Owner", email, "+91 90000 00000",
                    passwordEncoder.encode(password));
            demo.setRole(Role.USER);
            log.info("Demo data enabled: created demo owner account {}", email);
            return userRepository.save(demo);
        });

        List<Space> existingSpaces = spaceRepository.findAll().stream()
                .filter(space -> space.isOwnedBy(owner.getId()))
                .toList();

        for (Space space : List.of(communityGround(owner), communityHall(owner), rooftopDeck(owner))) {
            boolean exists = existingSpaces.stream()
                    .anyMatch(existing -> existing.getTitle().equalsIgnoreCase(space.getTitle()));
            if (exists) {
                continue;
            }
            spaceRepository.save(space);
            log.info("Demo data enabled: created space '{}'", space.getTitle());
        }

        List<Material> existingMaterials = materialRepository.findAll().stream()
                .filter(material -> material.isOwnedBy(owner.getId()))
                .toList();

        for (Material material : List.of(redClayBricks(owner), woodenBoards(owner),
                metalPipes(owner), surplusTiles(owner))) {
            boolean exists = existingMaterials.stream()
                    .anyMatch(existing -> existing.getTitle().equalsIgnoreCase(material.getTitle()));
            if (exists) {
                continue;
            }
            materialRepository.save(material);
            log.info("Demo data enabled: created material '{}'", material.getTitle());
        }
    }

    /**
     * Demo materials from the specification, all offered by the demo owner from
     * Jaggampeta. Quantities, units and conditions are exactly the ones written
     * there - nothing here is inferred or generated.
     */
    private Material redClayBricks(User owner) {
        Material material = new Material(owner, "Red Clay Bricks", MaterialCategory.BRICKS,
                "Surplus red clay bricks from a compound wall project. Clean, dry and stacked for pickup.",
                new BigDecimal("300"), "pieces", MaterialCondition.GOOD, "Jaggampeta, Andhra Pradesh");
        material.setPrice(new BigDecimal("2000"), false);
        material.setLatitude(new BigDecimal("17.116700"));
        material.setLongitude(new BigDecimal("81.933300"));
        material.setOwnerNote("Pickup on weekends; bring your own transport.");
        return material;
    }

    private Material woodenBoards(User owner) {
        Material material = new Material(owner, "Wooden Boards", MaterialCategory.WOOD,
                "Teak offcuts and boards left over from a carpentry job. Straight and dry.",
                new BigDecimal("40"), "pieces", MaterialCondition.GOOD, "Jaggampeta, Andhra Pradesh");
        material.setPrice(new BigDecimal("1500"), false);
        material.setLatitude(new BigDecimal("17.117100"));
        material.setLongitude(new BigDecimal("81.932700"));
        return material;
    }

    private Material metalPipes(User owner) {
        Material material = new Material(owner, "Metal Pipes", MaterialCategory.METAL,
                "Galvanised pipes from a dismantled shed. Solid, with surface rust at the ends.",
                new BigDecimal("25"), "pieces", MaterialCondition.USED, "Jaggampeta, Andhra Pradesh");
        material.setPrice(new BigDecimal("2500"), false);
        material.setLatitude(new BigDecimal("17.116200"));
        material.setLongitude(new BigDecimal("81.934100"));
        return material;
    }

    private Material surplusTiles(User owner) {
        Material material = new Material(owner, "Surplus Tiles", MaterialCategory.TILES,
                "Leftover floor tiles from a house build. Same batch, unopened boxes.",
                new BigDecimal("100"), "pieces", MaterialCondition.GOOD, "Jaggampeta, Andhra Pradesh");
        material.setPrice(BigDecimal.ZERO, true);
        material.setLatitude(new BigDecimal("17.115800"));
        material.setLongitude(new BigDecimal("81.932200"));
        material.setOwnerNote("Free to anyone who can collect them.");
        return material;
    }

    /** Mirrors the example listing from the specification. */
    private Space communityGround(User owner) {
        Space space = new Space(owner, "Community Ground",
                "Open community ground suitable for temporary events and community activities.",
                "Main Road, Bhimavaram, Andhra Pradesh");
        space.setLatitude(new BigDecimal("16.544900"));
        space.setLongitude(new BigDecimal("81.521200"));
        space.setArea(new BigDecimal("1.50"), AreaUnit.ACRES);
        space.setCapacity(500);
        space.setAvailability("Available on weekends and public holidays.");
        space.setOwnerNote("Medical camps and blood donation camps are free.");
        space.setStatus(SpaceStatus.ACTIVE);
        space.replaceFacilities(new LinkedHashSet<>(Set.of(
                Facility.PARKING, Facility.WATER, Facility.ELECTRICITY, Facility.ROAD_ACCESS)));
        space.replacePricing(new LinkedHashSet<>(List.of(
                new SpacePricing(ActivityType.MARKET, new BigDecimal("500"), false, null),
                new SpacePricing(ActivityType.UNION_MEETING, new BigDecimal("500"), false, null),
                new SpacePricing(ActivityType.STUDENT_FEST, new BigDecimal("500"), false, null),
                new SpacePricing(ActivityType.EXHIBITION, new BigDecimal("1000"), false, null),
                new SpacePricing(ActivityType.MEDICAL_CAMP, BigDecimal.ZERO, true,
                        "Free for health camps."),
                new SpacePricing(ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true,
                        "Free for blood donation camps."))));
        return space;
    }

    private Space communityHall(User owner) {
        Space space = new Space(owner, "Sunrise Community Hall",
                "Indoor hall with stage and seating, suited to meetings, workshops and cultural events.",
                "Gandhi Nagar, Bhimavaram, Andhra Pradesh");
        space.setLatitude(new BigDecimal("16.548100"));
        space.setLongitude(new BigDecimal("81.526500"));
        space.setArea(new BigDecimal("2500"), AreaUnit.SQ_FT);
        space.setCapacity(120);
        space.setAvailability("All week, mornings and evenings.");
        space.setStatus(SpaceStatus.ACTIVE);
        space.replaceFacilities(new LinkedHashSet<>(Set.of(
                Facility.ELECTRICITY, Facility.WATER, Facility.WASHROOMS,
                Facility.LIGHTING, Facility.STAGE, Facility.SEATING)));
        space.replacePricing(new LinkedHashSet<>(List.of(
                new SpacePricing(ActivityType.MEETING, new BigDecimal("700"), false, null),
                new SpacePricing(ActivityType.WORKSHOP, new BigDecimal("800"), false, null),
                new SpacePricing(ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true, null),
                new SpacePricing(ActivityType.CULTURAL_EVENT, new BigDecimal("1200"), false,
                        "Includes stage lighting."))));
        return space;
    }

    private Space rooftopDeck(User owner) {
        Space space = new Space(owner, "Terrace Event Deck",
                "Open rooftop deck with lighting and road access, suited to small exhibitions and cultural events.",
                "Sivaraopet, Bhimavaram, Andhra Pradesh");
        space.setLatitude(new BigDecimal("16.539400"));
        space.setLongitude(new BigDecimal("81.518900"));
        space.setArea(new BigDecimal("2000"), AreaUnit.SQ_FT);
        space.setCapacity(80);
        space.setAvailability("Evenings only.");
        space.setStatus(SpaceStatus.ACTIVE);
        space.replaceFacilities(new LinkedHashSet<>(Set.of(
                Facility.ELECTRICITY, Facility.LIGHTING, Facility.WATER,
                Facility.ROAD_ACCESS, Facility.PARKING)));
        space.replacePricing(new LinkedHashSet<>(List.of(
                new SpacePricing(ActivityType.EXHIBITION, new BigDecimal("900"), false, null),
                new SpacePricing(ActivityType.CULTURAL_EVENT, new BigDecimal("900"), false, null),
                new SpacePricing(ActivityType.MEETING, BigDecimal.ZERO, true, "Free for small meetings."))));
        return space;
    }
}
