package com.resource.backend.ai;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

import org.springframework.stereotype.Component;

import com.resource.backend.exception.BadRequestException;

/**
 * Decides whether an uploaded image may be sent to the AI provider, and shrinks
 * it when that helps.
 *
 * <p>Three rules, all enforced on the bytes rather than on the file name:</p>
 * <ol>
 *   <li>the content must really be a JPEG, PNG or WebP, checked by its magic
 *       numbers, so renaming a text file to {@code .png} is not enough;</li>
 *   <li>it must be within the configured size and pixel limits;</li>
 *   <li>it is downscaled to the configured edge before being sent, which keeps
 *       the request small and cheap. Nothing else about the file or its owner
 *       travels with it.</li>
 * </ol>
 */
@Component
public class AiImageValidator {

    private final AiProperties properties;

    public AiImageValidator(AiProperties properties) {
        this.properties = properties;
    }

    /**
     * Validates and prepares one image.
     *
     * @throws BadRequestException when the upload is not a usable image; the
     *                             message is written for a person, not a log
     */
    public PreparedImage prepare(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new BadRequestException("Choose an image to analyze.");
        }

        if (bytes.length > properties.maxImageBytes()) {
            throw new BadRequestException("That image is larger than " + describeLimit()
                    + ". Please use a smaller one.");
        }

        String detected = detectType(bytes);

        if (detected == null) {
            throw new BadRequestException("Only JPEG, PNG and WebP images can be analyzed.");
        }

        if (!"image/jpeg".equals(detected)) {
            return prepareUndecodable(bytes, detected);
        }

        BufferedImage image = read(bytes);

        if (image == null) {
            throw new BadRequestException("That image could not be read. Please try another one.");
        }

        return downscale(image, bytes);
    }

    private PreparedImage prepareUndecodable(byte[] bytes, String detected) {
        // PNG normally decodes with the JDK; if it does not, the file is broken.
        if ("image/png".equals(detected)) {
            BufferedImage image = read(bytes);

            if (image == null) {
                throw new BadRequestException("That image could not be read. Please try another one.");
            }

            return downscale(image, bytes);
        }

        // WebP has no reader in the JDK, so its dimensions are read from the
        // container instead of decoded. It cannot be downscaled here, which is
        // why the size limit above still applies.
        int[] dimensions = webpDimensions(bytes);

        if (dimensions == null) {
            throw new BadRequestException("That image could not be read. Please try another one.");
        }

        checkDimensions(dimensions[0], dimensions[1]);

        return new PreparedImage(bytes, "image/webp", dimensions[0], dimensions[1], false);
    }

    /** Re-encodes a JPEG at a smaller edge, or keeps the original when it is already small. */
    private PreparedImage downscale(BufferedImage image, byte[] original) {
        checkDimensions(image.getWidth(), image.getHeight());

        int edge = properties.maxImageEdge();
        int longest = Math.max(image.getWidth(), image.getHeight());

        if (longest <= edge) {
            return new PreparedImage(original, "image/jpeg", image.getWidth(), image.getHeight(), false);
        }

        double scale = (double) edge / longest;
        int width = Math.max(1, (int) Math.round(image.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(image.getHeight() * scale));

        BufferedImage scaled = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        scaled.createGraphics().drawImage(image.getScaledInstance(width, height, java.awt.Image.SCALE_SMOOTH),
                0, 0, null);

        byte[] encoded = encodeJpeg(scaled);

        return new PreparedImage(encoded == null ? original : encoded, "image/jpeg", width, height, encoded != null);
    }

    private void checkDimensions(int width, int height) {
        if (width <= 0 || height <= 0) {
            throw new BadRequestException("That image could not be read. Please try another one.");
        }

        int limit = properties.maxImageDimension();

        if (width > limit || height > limit) {
            throw new BadRequestException("That image is larger than " + limit + " pixels on one side. "
                    + "Please use a smaller one.");
        }
    }

    /** The size cap in the unit it reads best in. */
    private String describeLimit() {
        long megabytes = properties.maxImageBytes() / (1024 * 1024);

        return megabytes >= 1
                ? megabytes + " MB"
                : Math.max(1, Math.round(properties.maxImageBytes() / 1024.0)) + " KB";
    }

    private static BufferedImage read(byte[] bytes) {
        try {
            return ImageIO.read(new ByteArrayInputStream(bytes));
        } catch (IOException exception) {
            return null;
        }
    }

    private static byte[] encodeJpeg(BufferedImage image) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");

        if (writers == null || !writers.hasNext()) {
            return null;
        }

        ImageWriter writer = writers.next();

        try (ByteArrayOutputStream output = new ByteArrayOutputStream();
                ImageOutputStream stream = ImageIO.createImageOutputStream(output)) {

            writer.setOutput(stream);
            writer.write(null, new IIOImage(image, null, null), writer.getDefaultWriteParam());
            writer.dispose();

            return output.toByteArray();
        } catch (IOException exception) {
            writer.dispose();
            return null;
        }
    }

    /** Magic numbers only: what a file says it is counts for nothing. */
    private static String detectType(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xFF && (bytes[1] & 0xff) == 0xD8
                && (bytes[2] & 0xff) == 0xFF) {
            return "image/jpeg";
        }

        if (bytes.length >= 8 && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N'
                && bytes[3] == 'G') {
            return "image/png";
        }

        if (bytes.length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return "image/webp";
        }

        return null;
    }

    /**
     * Width and height out of a WebP container.
     *
     * <p>Handles the three chunk layouts: {@code VP8X} (extended, 24-bit canvas
     * size), {@code VP8 } (lossy, 14-bit size in the frame header) and
     * {@code VP8L} (lossless, 14-bit size packed into five bytes). Returns
     * {@code null} when the header cannot be trusted.</p>
     */
    static int[] webpDimensions(byte[] bytes) {
        if (bytes.length < 30) {
            return null;
        }

        String chunk = new String(bytes, 12, 4, java.nio.charset.StandardCharsets.US_ASCII);

        try {
            if ("VP8X".equals(chunk)) {
                int width = 1 + (bytes[24] & 0xff) + ((bytes[25] & 0xff) << 8) + ((bytes[26] & 0xff) << 16);
                int height = 1 + (bytes[27] & 0xff) + ((bytes[28] & 0xff) << 8) + ((bytes[29] & 0xff) << 16);

                return new int[] {width, height};
            }

            if ("VP8 ".equals(chunk)) {
                int width = ((bytes[27] & 0xff) << 8 | (bytes[26] & 0xff)) & 0x3fff;
                int height = ((bytes[29] & 0xff) << 8 | (bytes[28] & 0xff)) & 0x3fff;

                return new int[] {width, height};
            }

            if ("VP8L".equals(chunk)) {
                int bits = (bytes[22] & 0xff) | ((bytes[23] & 0xff) << 8)
                        | ((bytes[24] & 0xff) << 16) | ((bytes[25] & 0xff) << 24);

                int width = (bits & 0x3FFF) + 1;
                int height = ((bits >> 14) & 0x3FFF) + 1;

                return new int[] {width, height};
            }
        } catch (ArrayIndexOutOfBoundsException exception) {
            return null;
        }

        return null;
    }

    /**
     * An image that passed validation.
     *
     * @param resized true when the bytes sent to the provider were re-encoded
     */
    public record PreparedImage(byte[] bytes, String mimeType, int width, int height, boolean resized) {
    }
}
