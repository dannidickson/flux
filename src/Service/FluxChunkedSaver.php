<?php

namespace Flux\Service;

use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\DB;
use SilverStripe\Versioned\Versioned;
use Throwable;

/**
 * Writes a batch of FluxLiveState chunks in one transaction, inside-out
 * (DataObject → Element → Page) so the final Page render sees fresh child state.
 */
class FluxChunkedSaver
{

    private const array ORDER = [
        'DataObject' => 0,
        'Element' => 1,
        'Page' => 2,
    ];

    /**
     * @param array $chunks Each: { kind: 'DataObject'|'Element'|'Page', class, id, fields }
     * @return array { ok, saved: [{ kind, class, id }], errors: [{ kind, class, id, error }] }
     */
    public function save(array $chunks): array
    {
        return Versioned::withVersionedMode(function () use ($chunks) {
            Versioned::set_stage(Versioned::DRAFT);

            $ordered = $this->ordered($chunks);
            $saved = [];
            $errors = [];

            DB::get_conn()->transactionStart();

            try {
                foreach ($ordered as $chunk) {
                    $result = $this->writeChunk($chunk);

                    if (isset($result['error'])) {
                        $errors[] = $result;
                    } else {
                        $saved[] = $result;
                    }
                }

                if (!$errors) {
                    DB::get_conn()->transactionRollback();

                    return ['ok' => false, 'saved' => [], 'errors' => $errors];
                }

                DB::get_conn()->transactionEnd();

                return ['ok' => true, 'saved' => $saved, 'errors' => []];
            } catch (Throwable $e) {
                DB::get_conn()->transactionRollback();

                return [
                    'ok' => false,
                    'saved' => [],
                    'errors' => [['kind' => 'transaction', 'error' => $e->getMessage()]],
                ];
            }
        });
    }

    private function ordered(array $chunks): array
    {
        $sorted = $chunks;
        usort($sorted, function (array $a, array $b) {
            $oa = self::ORDER[$a['kind'] ?? ''] ?? 99;
            $ob = self::ORDER[$b['kind'] ?? ''] ?? 99;

            return $oa <=> $ob;
        });

        return $sorted;
    }

    private function writeChunk(array $chunk): array
    {
        $kind = $chunk['kind'] ?? null;
        $class = $chunk['class'] ?? null;
        $id = (int) ($chunk['id'] ?? 0);
        $fields = $chunk['fields'] ?? [];

        $base = ['kind' => $kind, 'class' => $class, 'id' => $id];

        if (!$kind || !$class || !$id) {
            return $base + ['error' => 'kind, class, id are required'];
        }

        if (!class_exists($class) || !is_subclass_of($class, DataObject::class)) {
            return $base + ['error' => 'unknown class'];
        }

        $record = DataObject::get_by_id($class, $id);

        if (!$record || !$record->exists()) {
            return $base + ['error' => 'record not found'];
        }

        if (!$record->canEdit()) {
            return $base + ['error' => 'forbidden'];
        }

        foreach ($fields as $name => $value) {
            if (!$record->hasField($name)) {
                continue;
            }

            $record->$name = $this->normalise($value);
        }

        $record->write();

        return $base;
    }

    private function normalise(mixed $value): mixed
    {
        if (is_array($value)) {
            return implode(',', $value);
        }

        return $value;
    }

}
